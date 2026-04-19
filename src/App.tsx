import { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  User as FirebaseUser
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp, 
  doc,
  updateDoc,
  deleteDoc,
  orderBy,
  limit,
  Timestamp,
  setDoc,
  getDoc,
  getDocs
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, Inbox, ArrowLeft, Radio, Headphones, Mic2, Signal, RadioReceiver, Heart, Loader2, Sparkles, MessageSquare, CheckCircle2, XCircle, Settings, ThumbsUp, Trash2, FileText, Bell, Share2, QrCode
} from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { cn } from './lib/utils';
import { processWorry, processReply, generateAIReply, processComment } from './services/geminiService';

// --- Constants ---
const CATEGORIES = ['취업', '진로', '학업', '시험', '소득', '주거', '연애', '결혼', '부모', '자녀', '우울', '불안', '외로움', '직장', '워라밸', '외모', '자존감', '건강', '노후', '미래'];
const GENDERS = [
  { id: 'male', label: '남성' }, 
  { id: 'female', label: '여성' }, 
  { id: 'hidden', label: '비공개' }
];

// --- Types ---
interface UserProfile {
  uid: string;
  gender: string;
  interests: string[];
  helpedCount?: number;
  createdAt: Timestamp;
}

interface Letter {
  id: string;
  senderId: string;
  receiverId: string; 
  originalContent: string;
  refinedContent: string;
  type: 'worry' | 'reply';
  categories?: string[]; // Multiple categories
  category?: string;     // Backward compatibility
  replyTo?: string;             
  replyToContent?: string;      
  createdAt: Timestamp;
  isRead: boolean;
  feedback?: 'helpful' | 'not_helpful' | null;
  publisherComment?: string;
}

// --- App Component ---
export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  
  const [view, setView] = useState<'onboarding' | 'home' | 'write_worry' | 'write_reply' | 'inbox' | 'my_replies' | 'read_reply' | 'read_my_reply' | 'settings'>('onboarding');
  
  const [feedWorries, setFeedWorries] = useState<Letter[]>([]);
  const [inboxReplies, setInboxReplies] = useState<Letter[]>([]);
  const [myGivenReplies, setMyGivenReplies] = useState<Letter[]>([]);
  const [myWorries, setMyWorries] = useState<Letter[]>([]);
  
  const [selectedWorry, setSelectedWorry] = useState<Letter | null>(null);
  const [selectedReply, setSelectedReply] = useState<Letter | null>(null);
  
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // PWA Install Logic
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState(false);

  useEffect(() => {
    const handler = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
      setDeferredPrompt(null);
    }
  };

  const [notificationPermission, setNotificationPermission] = useState<string>(
    'Notification' in window ? Notification.permission : 'denied'
  );

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  // Auth & Profile Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        
        if (userSnap.exists()) {
          const userData = userSnap.data() as UserProfile;
          setProfile(userData);
          // Only auto-redirect to home if we are not currently in the onboarding process
          setView(prev => (prev === 'onboarding' ? 'home' : prev));
        } else {
          setProfile(null);
          // If no profile, stay on onboarding
          setView('onboarding');
        }
        setLoading(false);
      } else {
        // Automatic Anonymous Sign-in
        try {
          await signInAnonymously(auth);
        } catch (err: any) {
          console.error("Anon Login Error", err);
          if (err.code === 'auth/admin-restricted-operation') {
            setError("Firebase 콘솔에서 '익명 로그인'을 활성화해야 합니다.");
          } else {
            setError("네트워크 문제로 익명 접속에 실패했습니다.");
          }
          setLoading(false);
        }
      }
    });
    return () => unsubscribe();
  }, []);

  // Active Users Listener
  const [activeUsersCount, setActiveUsersCount] = useState(1);
  useEffect(() => {
    if (!user) return;
    const twoMinsAgo = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 1000));
    const q = query(
      collection(db, 'users'),
      where('lastActive', '>=', twoMinsAgo)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setActiveUsersCount(Math.max(1, snap.size));
    });
    return () => unsubscribe();
  }, [user]);

  // Presence Updater
  useEffect(() => {
    if (!profile) return;
    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'users', profile.uid), {
          lastActive: serverTimestamp()
        });
      } catch (e) {
        console.error("Presence update failed", e);
      }
    };
    const interval = setInterval(updatePresence, 60000);
    return () => clearInterval(interval);
  }, [profile]);

  // Feed (Worries direct to me or public)
  useEffect(() => {
    if (!profile) return;

    // Super simple query to avoid ANY index requirements
    const q = query(
      collection(db, 'letters'),
      where('type', '==', 'worry'),
      limit(200)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      try {
        console.log(`Received snapshot with ${snapshot.size} worries.`);
        const allWorries = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Letter));
        
        // Final Filter Logic (Applied on the client side):
        // 1. Show if receiverId is 'public' (Admin/Global) -> ALWAYS SHOW
        // 2. Show if receiverId is MY UID AND it matches any of MY INTERESTS
        let filtered = allWorries.filter(w => {
          if (w.receiverId === 'public') return true;
          
          if (w.receiverId === profile.uid) {
            const worryCats = (w.categories || (w.category ? [w.category] : [])) as string[];
            const userInterests = profile.interests || [];
            const hasOverlap = worryCats.some(cat => userInterests.includes(cat));
            return hasOverlap;
          }
          return false;
        });

        // Sort on client side by createdAt (newest first)
        filtered.sort((a, b) => {
          const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
          const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
          return timeB - timeA;
        });

        console.log(`Feed updated: ${filtered.length} worries visible.`);
        setFeedWorries(filtered);
      } catch (err) {
        console.error("Error processing worries:", err);
      }
    }, (err) => {
      console.error("Feed Listener CRITICAL Error:", err);
    });

    return () => unsubscribe();
  }, [profile]);

  // Inbox (Replies) Listener
  const initialLoadRef = useRef(true);
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'letters'),
      where('type', '==', 'reply'),
      where('receiverId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!initialLoadRef.current) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const title = `📻 미드나잇 라디오`;
            const options = {
              body: "누군가 내 고민에 답변을 보냈어요. 지금 확인해보세요.",
              icon: '/pwa-192x192.png',
              badge: '/pwa-192x192.png',
            };

            if ('serviceWorker' in navigator && Notification.permission === 'granted') {
              navigator.serviceWorker.ready.then(registration => {
                registration.showNotification(title, options);
              });
            } else if (Notification.permission === 'granted') {
              new Notification(title, options);
            }
          }
        });
      }

      setInboxReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Letter)));
      
      if (initialLoadRef.current) initialLoadRef.current = false;
    });

    return () => unsubscribe();
  }, [user]);

  // Outbox (My Given Replies) Listener + Comment Notification
  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'letters'),
      where('type', '==', 'reply'),
      where('senderId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!initialLoadRef.current) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'modified') {
            const data = change.doc.data() as Letter;
            if (data.publisherComment && Notification.permission === 'granted') {
              const title = `💌 따뜻한 코멘트 도착`;
              const options = {
                body: `상대방이 감사 인사를 남겼어요: "${data.publisherComment}"`,
                icon: '/pwa-192x192.png',
              };

              if ('serviceWorker' in navigator) {
                navigator.serviceWorker.ready.then(registration => {
                  registration.showNotification(title, options);
                });
              } else {
                new Notification(title, options);
              }
            }
          }
        });
      }
      setMyGivenReplies(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Letter)));
    });

    return () => unsubscribe();
  }, [user]);

  // My Sent Worries Listener
  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'letters'),
      where('type', '==', 'worry'),
      where('senderId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubscribe = onSnapshot(q, (snapshot) => {
      setMyWorries(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Letter)));
    });
    return () => unsubscribe();
  }, [user]);

  const handleOnboardingSubmit = async (gender: string, interests: string[]) => {
    if (!user) {
      alert("로그인 정보가 없습니다.");
      return;
    }
    
    setIsProcessing(true);
    console.log("Submitting onboarding data...");

    try {
      const userRef = doc(db, 'users', user.uid);
      const now = Timestamp.now();
      
      const newProfileData: any = {
        uid: user.uid,
        gender,
        interests,
        helpedCount: 0,
        createdAt: now,
        lastActive: serverTimestamp() // Set to server timestamp for matching
      };
      
      // 1. Save to Firestore
      await setDoc(userRef, newProfileData, { merge: true });
      console.log("Profile saved successfully.");

      // 2. IMPORTANT: Update local state FIRST
      setProfile({ ...newProfileData, lastActive: now } as UserProfile);
      
      // 3. Forcefully switch view
      setView('home');
      
      // 4. Scroll to top
      window.scrollTo(0, 0);

    } catch (e: any) {
      console.error("Onboarding Submit Error:", e);
      alert(`데이터 저장에 실패했습니다. (사유: ${e.message})`);
    } finally {
      setIsProcessing(false);
    }
  };

  const [filterAlert, setFilterAlert] = useState<string | null>(null);

  // 1. Publish Worry -> Filter Check then Local Matching
  const publishWorry = async (content: string, selectedCategories: string[]) => {
    if (!user || !profile) {
      setFilterAlert("로그인 정보가 없습니다.");
      return;
    }
    setIsProcessing(true);
    try {
      console.log("Starting worry publication process (Optimized)...");

      // Step 1 & 2 in PARALLEL: LLM Filter + Fetch Active Users
      const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
      
      const [filterResult, usersSnap] = await Promise.all([
        processReply(content), // LLM Check
        getDocs(query(         // DB Fetch
          collection(db, 'users'), 
          where('lastActive', '>=', Timestamp.fromDate(oneDayAgo)),
          limit(50)
        ))
      ]);

      if (filterResult.status === 'rejected') {
        setFilterAlert(filterResult.reason || "부적절한 표현이 감지되었습니다.");
        setIsProcessing(false);
        return;
      }

      const allHumanUsers = usersSnap.docs
        .map(d => d.data() as UserProfile)
        .filter(u => u.uid !== user.uid);

      console.log(`Matching from ${allHumanUsers.length} active users.`);

      // B. Calculate Intersection Score
      const scoredHumans = allHumanUsers.map(u => {
        const userInterests = u.interests || [];
        const intersection = userInterests.filter(i => (selectedCategories || []).includes(i));
        return { ...u, score: intersection.length };
      });

      // C. Get humans with at least one matching interest (score > 0), sorted by score
      const matchingHumans = scoredHumans
        .filter(h => h.score > 0)
        .sort((a, b) => b.score - a.score);

      // D. Final Assigned IDs Logic
      // - First, take matching humans (up to 3)
      // - If fewer than 3, fill the rest with AI bots
      let assignedCandidates: (UserProfile | any)[] = matchingHumans.slice(0, 3);
      
      if (assignedCandidates.length < 3) {
        console.log(`Only found ${assignedCandidates.length} matching humans. Adding AI bots...`);
        const needed = 3 - assignedCandidates.length;
        const aiBots = [
          { uid: 'bot_empathy', gender: 'female', interests: selectedCategories || [] },
          { uid: 'bot_logic', gender: 'male', interests: selectedCategories || [] },
          { uid: 'bot_friend', gender: 'hidden', interests: selectedCategories || [] }
        ];
        // Combine and ensure we have 3 unique ones
        assignedCandidates = [...assignedCandidates, ...aiBots.slice(0, needed)];
      }

      const assignedIds = assignedCandidates.map(c => c.uid);
      console.log("Assigned Recipients:", assignedIds);

      // Step 3: Save to Firestore
      // Use a simpler map without waiting for individual AI generations inside Promise.all
      await Promise.all(assignedCandidates.map(async (candidate) => {
        const receiverId = candidate.uid;
        
        // 1. Save the Worry (This is the only part we MUST wait for)
        const worryRef = await addDoc(collection(db, 'letters'), {
          senderId: user.uid,
          receiverId, 
          originalContent: content,
          refinedContent: content, 
          type: 'worry',
          categories: selectedCategories,
          category: selectedCategories[0],
          createdAt: serverTimestamp(),
          isRead: false
        });

        // 2. Trigger AI reply in the BACKGROUND (Do NOT use 'await' here)
        if (receiverId.startsWith('bot_')) {
          // Launch as an independent async task
          (async () => {
            try {
              console.log(`[Background] Generating AI reply for ${receiverId}...`);
              const aiResponse = await generateAIReply(content, candidate);
              const replyText = aiResponse.content || "당신의 고민을 잘 읽었어요. 마음이 따뜻해지는 밤 되시길 바랄게요.";

              await addDoc(collection(db, 'letters'), {
                senderId: receiverId, 
                receiverId: user.uid,
                originalContent: replyText,
                refinedContent: replyText,
                type: 'reply',
                replyTo: worryRef.id,
                replyToContent: content,
                createdAt: serverTimestamp(),
                isRead: false,
                feedback: null
              });
              console.log(`[Background] AI reply from ${receiverId} saved.`);
            } catch (botErr) {
              console.error(`[Background] AI bot reply failed for ${receiverId}:`, botErr);
            }
          })(); // IIFE to run in background
        }
      }));

      console.log("Worry submission successful.");
      setView('home');
      window.scrollTo(0, 0);
    } catch (e: any) {
      console.error("Publication Error:", e);
      setFilterAlert(`전송 실패: ${e.message || "알 수 없는 오류"}`);
    } finally {
      setIsProcessing(false);
    }
  };


  // 2. Send Reply -> Filter Check First
  const sendReply = async (content: string, worry: Letter) => {
    if (!user) return;
    setIsProcessing(true);
    try {
      const result = await processReply(content);
      if (result.status === 'rejected') {
        setFilterAlert("부적절한 표현이 감지되었습니다.");
        setIsProcessing(false);
        return;
      }

      await addDoc(collection(db, 'letters'), {
        senderId: user.uid,
        receiverId: worry.senderId, // Always reply back to original sender
        originalContent: content,
        refinedContent: content,
        type: 'reply',
        replyTo: worry.id,
        replyToContent: worry.originalContent,
        createdAt: serverTimestamp(),
        isRead: false,
        feedback: null
      });

      setView('home');
      setSelectedWorry(null);
    } catch (e) {
      console.error(e);
      setFilterAlert("답장 전송 실패");
    } finally {
      setIsProcessing(false);
    }
  };

  const giveFeedback = async (replyId: string, feedbackType: 'helpful' | 'not_helpful') => {
    try {
      await updateDoc(doc(db, 'letters', replyId), { feedback: feedbackType });
      setSelectedReply(prev => prev ? { ...prev, feedback: feedbackType } : null);

      if (feedbackType === 'helpful' && selectedReply) {
        // Increment helpedCount for the replier
        const replierRef = doc(db, 'users', selectedReply.senderId);
        const replierSnap = await getDoc(replierRef);
        if (replierSnap.exists()) {
          const currentCount = replierSnap.data().helpedCount || 0;
          await updateDoc(replierRef, { helpedCount: currentCount + 1 });
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  const deleteLetter = async (e: React.MouseEvent, letterId: string) => {
    e.stopPropagation(); // Prevent opening the letter view
    if (!confirm("이 메시지를 삭제하시겠습니까?")) return;
    try {
      await deleteDoc(doc(db, 'letters', letterId));
      console.log("Letter deleted:", letterId);
    } catch (err) {
      console.error("Delete failed:", err);
      alert("삭제에 실패했습니다.");
    }
  };

  const unreadRepliesCount = inboxReplies.filter(r => !r.isRead).length;

  if (loading) {
    return <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center"><Loader2 className="w-8 h-8 text-[#D4A373] animate-spin" /></div>;
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center p-6 text-center">
        <XCircle className="w-12 h-12 text-red-500 mb-4" />
        <h1 className="text-xl font-bold mb-2">접속 문제가 발생했습니다</h1>
        <p className="text-[#8B8B6B] mb-6">{error}</p>
        <button onClick={() => window.location.reload()} className="px-6 py-2 bg-[#5A5A40] text-white rounded-xl font-bold">다시 시도</button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-[#5A5A40] font-sans selection:bg-[#FAEDCD]">
      <AnimatePresence>
        {filterAlert && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm px-4"
          >
            <motion.div 
              initial={{ scale: 0.95 }} animate={{ scale: 1 }} exit={{ scale: 0.95 }}
              className="bg-white rounded-2xl p-6 shadow-2xl max-w-sm w-full text-center space-y-6"
            >
              <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto text-red-500">
                <XCircle className="w-6 h-6" />
              </div>
              <p className="font-bold text-lg text-gray-800">{filterAlert}</p>
              <button 
                onClick={() => setFilterAlert(null)}
                className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-bold transition-all hover:bg-[#4A4A30]"
              >
                확인
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header (hidden in onboarding) */}
      {view !== 'onboarding' && (
        <header className="fixed top-0 left-0 right-0 bg-[#FDFCF8]/80 backdrop-blur-md z-50 border-b border-[#E9EDC9]/50">
          <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
            <button onClick={() => setView('home')} className="text-xl font-serif font-bold tracking-tight text-[#D4A373] flex items-center gap-2">
              <Radio className="w-5 h-5" /> 미드나잇 라디오
            </button>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 px-3 py-1.5 bg-[#E9EDC9]/50 rounded-full text-[10px] sm:text-xs font-bold text-[#A3B18A]">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A3B18A] opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A3B18A]"></span>
                </span>
                {activeUsersCount}명
              </div>
              <button 
                onClick={() => setView('settings')}
                className="relative p-2 hover:bg-[#FAEDCD] rounded-full transition-colors text-[#8B8B6B] hover:text-[#5A5A40]"
              >
                <Settings className="w-6 h-6" />
              </button>
              <button 
                onClick={() => setView('inbox')}
                className="relative p-2 hover:bg-[#FAEDCD] rounded-full transition-colors"
              >
                <Inbox className="w-6 h-6" />
                {unreadRepliesCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 bg-[#E07A5F] rounded-full flex items-center justify-center text-[10px] text-white font-bold border-2 border-[#FDFCF8]">
                    {unreadRepliesCount}
                  </span>
                )}
              </button>
            </div>
          </div>
        </header>
      )}

      <main className={cn("max-w-2xl mx-auto px-6", view === 'onboarding' ? "pt-12 pb-12" : "pt-24 pb-32")}>
        <AnimatePresence mode="wait">
          
          {/* 1. Onboarding View */}
          {view === 'onboarding' && (
            <motion.div key="onboarding" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
              <div className="text-center space-y-4 mb-10">
                <div className="w-20 h-20 bg-[#FAEDCD] rounded-full flex items-center justify-center mx-auto shadow-sm">
                  <Mic2 className="w-10 h-10 text-[#D4A373]" />
                </div>
                <h1 className="text-3xl font-serif font-bold text-[#5A5A40]">주파수를 맞춰주세요</h1>
                <p className="text-[#8B8B6B]">당신의 취향을 알려주시면<br/>꼭 맞는 라디오 사연을 먼저 들려드릴게요.</p>
              </div>

              <OnboardingForm onSubmit={handleOnboardingSubmit} isProcessing={isProcessing} />
            </motion.div>
          )}

          {/* 1.5 Settings View */}
          {view === 'settings' && profile && (
            <motion.div key="settings" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }} className="space-y-8">
              <button onClick={() => setView('home')} className="mb-2 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 돌아가기
              </button>
              
              <div className="flex items-center gap-4 bg-[#FAEDCD]/50 p-6 rounded-2xl border border-[#FAEDCD] mb-8">
                <div className="w-14 h-14 bg-white rounded-full flex items-center justify-center text-[#E07A5F] shadow-sm">
                  <Heart className="w-7 h-7" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-[#5A5A40]">나의 따뜻한 발자취</h2>
                  <p className="text-[#8B8B6B] text-sm">지금까지 <strong className="text-[#E07A5F]">{profile.helpedCount || 0}</strong>번의 고민을 다정하게 안아주셨어요.</p>
                </div>
              </div>

              <div className="bg-white p-6 rounded-2xl border border-[#E9EDC9] space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-[#FAEDCD] rounded-full flex items-center justify-center text-[#D4A373]">
                      <Bell className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-[#5A5A40]">푸시 알림 설정</h3>
                      <p className="text-xs text-[#8B8B6B]">새로운 사연이나 답장 알림을 받습니다.</p>
                    </div>
                  </div>
                  <div className={cn(
                    "px-3 py-1 rounded-full text-[10px] font-bold",
                    notificationPermission === 'granted' ? "bg-green-50 text-green-600" : (notificationPermission === 'denied' ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-500")
                  )}>
                    {notificationPermission === 'granted' ? '활성화됨' : (notificationPermission === 'denied' ? '차단됨' : '설정 필요')}
                  </div>
                </div>

                {notificationPermission !== 'granted' && (
                  <button 
                    onClick={requestNotificationPermission}
                    className="w-full py-3 bg-[#E07A5F] text-white rounded-xl text-sm font-bold shadow-sm hover:bg-[#D46A4F] transition-all flex items-center justify-center gap-2"
                  >
                    <Signal className="w-4 h-4" /> 알림 권한 허용하기
                  </button>
                )}
                {notificationPermission === 'denied' && (
                  <p className="text-[10px] text-[#E07A5F] text-center">브라우저 설정에서 알림 권한을 직접 허용해 주세요.</p>
                )}
              </div>

              <div className="bg-[#5A5A40] p-8 rounded-3xl text-white space-y-8 shadow-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 bg-white/10 rounded-full flex items-center justify-center">
                    <QrCode className="w-5 h-5 text-[#FAEDCD]" />
                  </div>
                  <div>
                    <h3 className="font-bold text-lg">어플 다운로드 / 공유</h3>
                    <p className="text-sm text-[#FAEDCD]/80">바탕화면에 설치하여 진짜 앱처럼 쓰세요.</p>
                  </div>
                </div>

                {/* 1. One-Click Install Button (Android/Chrome) */}
                {isInstallable && (
                  <button 
                    onClick={handleInstallClick}
                    className="w-full py-4 bg-[#E07A5F] text-white rounded-2xl font-bold shadow-lg hover:scale-[1.02] transition-all flex items-center justify-center gap-3"
                  >
                    <Send className="w-5 h-5 rotate-90" /> 지금 바로 어플 설치하기
                  </button>
                )}
                
                {/* 2. QR Section */}
                <div className="bg-white p-4 rounded-2xl w-fit mx-auto shadow-inner">
                  <QRCodeSVG 
                    value={window.location.origin} 
                    size={140}
                    level="H"
                  />
                </div>

                {/* 3. Detailed Instructions */}
                <div className="space-y-6 pt-4 border-t border-white/10">
                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-[#FAEDCD] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[#E07A5F] rounded-full" /> 아이폰(iOS) 설치 방법
                    </h4>
                    <p className="text-[11px] text-[#FAEDCD]/70 leading-relaxed pl-3">
                      1. 하단 메뉴의 <strong className="text-white">[공유 버튼 <Share2 className="w-3 h-3 inline mb-0.5" />]</strong>을 누릅니다.<br/>
                      2. 리스트를 내려 <strong className="text-white">[홈 화면에 추가]</strong>를 누릅니다.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <h4 className="text-xs font-bold text-[#FAEDCD] flex items-center gap-2">
                      <div className="w-1.5 h-1.5 bg-[#A3B18A] rounded-full" /> 안드로이드 설치 방법
                    </h4>
                    <p className="text-[11px] text-[#FAEDCD]/70 leading-relaxed pl-3">
                      1. 상단 <strong className="text-white">[설치 버튼]</strong>을 누르거나,<br/>
                      2. 브라우저 우측 상단 <strong className="text-white">[점 세개]</strong> 메뉴에서 <strong className="text-white">[앱 설치]</strong>를 누릅니다.
                    </p>
                  </div>
                </div>

                <div className="text-center">
                  <button 
                    onClick={() => {
                      if (navigator.share) {
                        navigator.share({ title: '미드나잇 라디오', text: '당신의 밤을 위로하는 익명 라디오 사연 앱', url: window.location.origin });
                      } else {
                        navigator.clipboard.writeText(window.location.origin);
                        alert("링크가 복사되었습니다!");
                      }
                    }}
                    className="flex items-center gap-2 mx-auto text-xs font-bold bg-white/10 px-4 py-2 rounded-full hover:bg-white/20 transition-all"
                  >
                    <Share2 className="w-3 h-3" /> 링크 공유하기
                  </button>
                </div>
              </div>

              <div className="text-left space-y-2 mb-10">
                <h1 className="text-3xl font-serif font-bold text-[#5A5A40]">내 주파수 설정</h1>
                <p className="text-[#8B8B6B]">나의 성별과 가장 관심있는 고민 주제를 변경할 수 있어요.</p>
              </div>

              <OnboardingForm 
                onSubmit={handleOnboardingSubmit} 
                isProcessing={isProcessing} 
                initialGender={profile.gender}
                initialInterests={profile.interests}
              />
            </motion.div>
          )}

          {/* 2. Home View (Feed) */}
          {view === 'home' && (
            <motion.div key="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-8">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-serif font-bold">오늘 밤의 사연들</h2>
                <span className="text-xs bg-[#E9EDC9] text-[#5A5A40] px-3 py-1 rounded-full">{profile?.interests?.join(', ') || '관심 주제'} 사연 위주</span>
              </div>

              {feedWorries.length === 0 ? (
                <div className="text-center py-16 bg-white/50 rounded-3xl border border-dashed border-[#E9EDC9]">
                  <RadioReceiver className="w-12 h-12 text-[#E9EDC9] mx-auto mb-3" />
                  <p className="text-[#8B8B6B]">아직 도착한 사연이 없네요.<br/>첫 번째 사연을 남겨보시겠어요?</p>
                </div>
              ) : (
                <div className="grid gap-6">
                  {feedWorries.map(worry => (
                    <div key={worry.id} className="bg-white p-6 rounded-2xl shadow-sm border border-[#FAEDCD] relative group">
                      <button 
                        onClick={(e) => deleteLetter(e, worry.id)}
                        className="absolute top-4 right-4 p-2 text-[#8B8B6B] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                      <div className="flex items-center gap-2 mb-4">
                        <span className="px-2.5 py-1 bg-[#FAEDCD] text-[#D4A373] text-[10px] font-bold rounded-lg border border-[#E9EDC9]">
                          {worry.category || '기타'}
                        </span>
                        <span className="text-[#8B8B6B] text-xs">· 조금 전 수신됨</span>
                      </div>
                      <p className="text-[#5A5A40] leading-relaxed mb-6 whitespace-pre-wrap font-medium">
                        "{worry.refinedContent}"
                      </p>
                      {myGivenReplies.some(r => r.replyTo === worry.id) ? (
                        <div className="w-full py-3 bg-[#E9EDC9]/30 text-[#A3B18A] font-bold border border-[#E9EDC9] rounded-xl flex items-center justify-center gap-2">
                          <CheckCircle2 className="w-4 h-4" /> 답장 완료!
                        </div>
                      ) : (
                        <button 
                          onClick={() => { setSelectedWorry(worry); setView('write_reply'); }}
                          className="w-full py-3 bg-[#FDFCF8] text-[#8B8B6B] font-medium border border-[#E9EDC9] rounded-xl hover:bg-[#FAEDCD] hover:text-[#5A5A40] transition-colors flex items-center justify-center gap-2"
                        >
                          <MessageSquare className="w-4 h-4" /> 다정하게 답장해주기
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Floating Action Button */}
              <button 
                onClick={() => setView('write_worry')}
                className="fixed bottom-8 right-1/2 translate-x-1/2 sm:right-auto sm:translate-x-0 sm:left-1/2 sm:ml-48 px-6 py-4 bg-[#E07A5F] text-white rounded-full shadow-xl font-bold flex items-center gap-3 hover:scale-105 transition-transform"
              >
                <Send className="w-5 h-5" /> 내 고민 송출하기
              </button>
            </motion.div>
          )}

          {/* 3. Write Worry View */}
          {view === 'write_worry' && (
            <motion.div key="write_worry" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <button onClick={() => setView('home')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 돌아가기
              </button>
              <h2 className="text-2xl font-serif font-bold mb-2">고민을 적어보세요</h2>
              <p className="text-[#8B8B6B] mb-8">당신의 날선 감정도, 속상함도 AI가 따뜻하고 차분한 어조로 다듬어 누군가에게 송출해 줍니다.</p>
              
              <WriteForm type="worry" isProcessing={isProcessing} onSubmit={(content, cat) => publishWorry(content, cat!)} />
            </motion.div>
          )}

          {/* 4. Write Reply View */}
          {view === 'write_reply' && selectedWorry && (
            <motion.div key="write_reply" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
              <button onClick={() => setView('home')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 돌아가기
              </button>
              <div className="bg-[#FAEDCD]/50 p-6 rounded-2xl mb-8 border border-[#FAEDCD]">
                <div className="text-xs font-bold text-[#D4A373] mb-2">답장할 사연 ({selectedWorry.category})</div>
                <p className="text-[#5A5A40] text-sm leading-relaxed whitespace-pre-wrap">{selectedWorry.refinedContent}</p>
              </div>
              
              <h2 className="text-2xl font-serif font-bold mb-2">위로를 건네주세요</h2>
              <p className="text-[#8B8B6B] mb-8">AI가 당신의 답변을 더 다정하고 부드럽게 다듬어 상대방에게 전달합니다.</p>
              
              <WriteForm type="reply" isProcessing={isProcessing} onSubmit={(content) => sendReply(content, selectedWorry)} />
            </motion.div>
          )}

          {/* 5. Inbox (My Received Replies & My Given Replies) View */}
          {view === 'inbox' && (
            <motion.div key="inbox" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <button onClick={() => setView('home')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 피드로 돌아가기
              </button>
              
              <Tabs 
                tabs={[
                  { id: 'received', label: `받은 답장 (${inboxReplies.length})` },
                  { id: 'given', label: `내가 한 위로 (${myGivenReplies.length})` },
                  { id: 'sent', label: `내 고민 내역 (${myWorries.length})` }
                ]}
                render={(activeTab) => (
                  <div className="mt-6">
                    {activeTab === 'received' && (
                      inboxReplies.length === 0 ? (
                        <div className="text-center py-16 bg-white/50 rounded-3xl border border-dashed border-[#E9EDC9]">
                          <Inbox className="w-12 h-12 text-[#E9EDC9] mx-auto mb-3" />
                          <p className="text-[#8B8B6B]">아직 도착한 답장이 없어요.</p>
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {inboxReplies.map(reply => (
                            <button 
                              key={reply.id}
                              onClick={() => { 
                                updateDoc(doc(db, 'letters', reply.id), { isRead: true });
                                setSelectedReply(reply); 
                                setView('read_reply'); 
                              }}
                              className={cn(
                                "w-full text-left p-6 rounded-2xl border transition-all relative group",
                                reply.isRead ? "bg-white border-[#E9EDC9]" : "bg-[#FAEDCD] border-[#D4A373] shadow-md"
                              )}
                            >
                              <button 
                                onClick={(e) => deleteLetter(e, reply.id)}
                                className="absolute top-4 right-4 p-2 text-[#8B8B6B] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="flex items-center gap-2 mb-3">
                                <Headphones className={cn("w-4 h-4", reply.isRead ? "text-[#A3B18A]" : "text-[#E07A5F]")} />
                                <span className="text-xs font-semibold text-[#8B8B6B]">
                                  {reply.senderId.startsWith('bot_') ? 'AI 위로 메신저' : '누군가의 따뜻한 답장'}
                                </span>
                                {!reply.isRead && <span className="ml-auto w-2 h-2 bg-[#E07A5F] rounded-full" />}
                              </div>
                              <p className="text-[#5A5A40] font-medium line-clamp-2 leading-relaxed">
                                {reply.refinedContent}
                              </p>
                              {reply.publisherComment && (
                                <div className="mt-3 text-xs text-[#E07A5F] font-bold">새로운 코멘트 도착!</div>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    )}

                    {activeTab === 'given' && (
                      myGivenReplies.length === 0 ? (
                        <div className="text-center py-16 bg-white/50 rounded-3xl border border-dashed border-[#E9EDC9]">
                          <Heart className="w-12 h-12 text-[#E9EDC9] mx-auto mb-3" />
                          <p className="text-[#8B8B6B]">아직 내가 보낸 위로가 없어요.</p>
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {myGivenReplies.map(reply => (
                            <button 
                              key={reply.id}
                              onClick={() => { 
                                setSelectedReply(reply); 
                                setView('read_my_reply'); 
                              }}
                              className="w-full text-left p-6 bg-white rounded-2xl border border-[#E9EDC9] transition-all hover:bg-[#FAEDCD] relative group"
                            >
                              <button 
                                onClick={(e) => deleteLetter(e, reply.id)}
                                className="absolute top-4 right-4 p-2 text-[#8B8B6B] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="flex items-center gap-2 mb-3">
                                <Send className="w-4 h-4 text-[#A3B18A]" />
                                <span className="text-xs font-semibold text-[#8B8B6B]">나의 다정한 위로</span>
                                {reply.feedback === 'helpful' && <Heart className="w-4 h-4 text-[#E07A5F] ml-auto" />}
                              </div>
                              <p className="text-[#5A5A40] font-medium line-clamp-2 leading-relaxed">
                                {reply.refinedContent}
                              </p>
                              {reply.publisherComment && (
                                <div className="mt-3 bg-[#FAEDCD]/50 p-2 rounded text-xs text-[#5A5A40]">
                                  <strong>답장받은 분의 코멘트:</strong> {reply.publisherComment}
                                </div>
                              )}
                            </button>
                          ))}
                        </div>
                      )
                    )}

                    {activeTab === 'sent' && (
                      myWorries.length === 0 ? (
                        <div className="text-center py-16 bg-white/50 rounded-3xl border border-dashed border-[#E9EDC9]">
                          <FileText className="w-12 h-12 text-[#E9EDC9] mx-auto mb-3" />
                          <p className="text-[#8B8B6B]">아직 송출한 고민이 없어요.</p>
                        </div>
                      ) : (
                        <div className="grid gap-4">
                          {myWorries.map(worry => (
                            <div key={worry.id} className="w-full text-left p-6 bg-white rounded-2xl border border-[#E9EDC9] relative group">
                              <button 
                                onClick={(e) => deleteLetter(e, worry.id)}
                                className="absolute top-4 right-4 p-2 text-[#8B8B6B] opacity-0 group-hover:opacity-100 hover:text-red-500 transition-all"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                              <div className="flex items-center gap-2 mb-3">
                                <Signal className="w-4 h-4 text-[#D4A373]" />
                                <span className="text-xs font-semibold text-[#8B8B6B]">
                                  수신인: {worry.receiverId === 'public' ? '모든 이용자' : (worry.receiverId.startsWith('bot_') ? 'AI 답변자' : '익명 이용자')}
                                </span>
                                <span className="ml-auto text-[10px] text-[#E9EDC9] font-bold bg-[#FAEDCD] px-2 py-0.5 rounded-full">
                                  {(worry.categories || [worry.category]).join(', ')}
                                </span>
                              </div>
                              <p className="text-[#5A5A40] font-medium line-clamp-2 leading-relaxed italic">
                                "{worry.originalContent}"
                              </p>
                            </div>
                          ))}
                        </div>
                      )
                    )}
                  </div>
                )}
              />
            </motion.div>
          )}

          {/* 6. Read Reply & Feedback View */}
          {view === 'read_reply' && selectedReply && (
            <motion.div key="read_reply" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
               <button onClick={() => setView('inbox')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 목록으로
              </button>
              
              <div className="space-y-6">
                {/* Original Worry */}
                <div className="bg-white p-6 rounded-2xl border border-[#E9EDC9]">
                  <div className="text-xs font-bold text-[#A3B18A] mb-3">내가 보냈던 고민</div>
                  <p className="text-[#8B8B6B] text-sm leading-relaxed whitespace-pre-wrap opacity-80">
                    {selectedReply.replyToContent}
                  </p>
                </div>

                {/* The Reply */}
                <div className="bg-[#FAEDCD] p-8 rounded-2xl shadow-sm border border-[#D4A373]">
                  <div className="flex items-center gap-2 mb-6">
                    <Heart className="w-5 h-5 text-[#E07A5F]" />
                    <span className="font-bold text-[#D4A373]">도착한 답장</span>
                  </div>
                  <p className="text-[#5A5A40] text-lg font-medium leading-loose whitespace-pre-wrap mb-8">
                    {selectedReply.refinedContent}
                  </p>
                </div>

                {/* Feedback Section */}
                <div className="pt-8 text-center border-t border-[#E9EDC9]">
                  {selectedReply.feedback ? (
                    <div className="space-y-6">
                      <div className="inline-flex items-center gap-2 px-6 py-3 bg-white border border-[#E9EDC9] rounded-full text-sm font-bold text-[#5A5A40]">
                        {selectedReply.feedback === 'helpful' ? (
                          <><CheckCircle2 className="w-5 h-5 text-[#A3B18A]" /> 위로가 되었다고 마음을 전했어요.</>
                        ) : (
                          <><CheckCircle2 className="w-5 h-5 text-[#8B8B6B]" /> 확인을 완료했어요.</>
                        )}
                      </div>
                      
                      {!selectedReply.publisherComment ? (
                        <div className="bg-white p-6 rounded-2xl border border-[#FAEDCD]">
                          <h4 className="font-bold text-[#5A5A40] mb-2 text-sm">따뜻한 마음을 받은 답장, 코멘트 남기기</h4>
                          <p className="text-xs text-[#8B8B6B] mb-4">내 고민을 들어준 분에게 감사 인사나 추가 코멘트를 남길 수 있습니다.</p>
                          <CommentForm replyId={selectedReply.id} onCommentAdded={(c) => setSelectedReply({...selectedReply, publisherComment: c})} />
                        </div>
                      ) : (
                        <div className="bg-[#FAEDCD]/50 p-6 rounded-2xl border border-[#E9EDC9]">
                          <div className="text-xs font-bold text-[#A3B18A] mb-2">내가 남긴 코멘트</div>
                          <p className="text-[#5A5A40] text-sm leading-relaxed">{selectedReply.publisherComment}</p>
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <h3 className="font-bold text-lg mb-4 text-[#5A5A40]">이 답장이 해결이나 위로에 도움이 되었나요?</h3>
                      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
                        <button 
                          onClick={() => giveFeedback(selectedReply.id, 'helpful')}
                          className="w-full sm:w-auto px-6 py-4 bg-[#E07A5F] text-white rounded-xl font-bold flex items-center justify-center gap-2 hover:bg-[#D46A4F] transition-all"
                        >
                          <ThumbsUp className="w-5 h-5" /> 위로가 되었어요!
                        </button>
                        <button 
                          onClick={() => giveFeedback(selectedReply.id, 'not_helpful')}
                          className="w-full sm:w-auto px-6 py-4 bg-white border border-[#E9EDC9] text-[#8B8B6B] rounded-xl font-bold hover:bg-[#FAEDCD] transition-all"
                        >
                          그냥 그랬어요
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* 7. Read My Reply View */}
          {view === 'read_my_reply' && selectedReply && (
            <motion.div key="read_my_reply" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -20 }}>
               <button onClick={() => setView('inbox')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 목록으로
              </button>
              
              <div className="space-y-6">
                {/* Original Worry */}
                <div className="bg-white p-6 rounded-2xl border border-[#E9EDC9]">
                  <div className="text-xs font-bold text-[#A3B18A] mb-3">전달받은 고민</div>
                  <p className="text-[#8B8B6B] text-sm leading-relaxed whitespace-pre-wrap opacity-80">
                    {selectedReply.replyToContent}
                  </p>
                </div>

                {/* My Reply */}
                <div className="bg-[#FAEDCD] p-8 rounded-2xl shadow-sm border border-[#D4A373]">
                  <div className="flex items-center gap-2 mb-6">
                    <Send className="w-5 h-5 text-[#E07A5F]" />
                    <span className="font-bold text-[#D4A373]">내가 남긴 다정한 답장</span>
                  </div>
                  <p className="text-[#5A5A40] text-lg font-medium leading-loose whitespace-pre-wrap mb-8">
                    {selectedReply.refinedContent}
                  </p>
                </div>

                {/* Feedback & Comment Section */}
                <div className="pt-4 space-y-4">
                  {selectedReply.feedback === 'helpful' && (
                    <div className="flex items-center justify-center gap-2 px-6 py-4 bg-white border border-[#E9EDC9] rounded-2xl text-[#5A5A40] font-bold">
                      <Heart className="w-5 h-5 text-[#E07A5F]" /> 
                      작성자에게 위로가 되었다는 답신이 왔어요! (해결 횟수 +1)
                    </div>
                  )}

                  {selectedReply.publisherComment && (
                    <div className="bg-white p-6 rounded-2xl border border-[#D4A373]">
                      <div className="text-xs font-bold text-[#D4A373] mb-3">작성자가 남긴 코멘트</div>
                      <p className="text-[#5A5A40] text-sm leading-relaxed whitespace-pre-wrap">
                        {selectedReply.publisherComment}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </main>
    </div>
  );
}

// --- Sub Components ---

function OnboardingForm({ onSubmit, isProcessing, initialGender = '', initialInterests = [] }: { onSubmit: (g: string, i: string[]) => void, isProcessing: boolean, initialGender?: string, initialInterests?: string[] }) {
  const [gender, setGender] = useState<string>(initialGender);
  const [interests, setInterests] = useState<string[]>(initialInterests);

  const toggleInterest = (i: string) => {
    if (interests.includes(i)) setInterests(interests.filter(x => x !== i));
    else setInterests([...interests, i]);
  };

  const isValid = gender !== '' && interests.length > 0;
  const isEditing = initialGender !== '';

  return (
    <div className="space-y-10">
      <div className="space-y-4">
        <h3 className="font-bold text-lg">성별</h3>
        <div className="flex gap-3">
          {GENDERS.map(g => (
            <button 
              key={g.id} onClick={() => setGender(g.id)}
              className={cn("flex-1 py-3 rounded-xl border font-medium transition-all", gender === g.id ? "bg-[#D4A373] text-white border-[#D4A373] shadow-md" : "bg-white text-[#8B8B6B] border-[#E9EDC9] hover:bg-[#FAEDCD]")}
            >
              {g.label}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="font-bold text-lg">가장 관심있는 고민 주제 (원하는 만큼 복수 선택)</h3>
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map(cat => {
            const isSelected = interests.includes(cat);
            return (
              <button 
                key={cat} onClick={() => toggleInterest(cat)}
                className={cn("px-4 py-2.5 rounded-full border text-sm font-bold transition-all", isSelected ? "bg-[#A3B18A] text-white border-[#A3B18A] shadow-md" : "bg-white text-[#8B8B6B] border-[#E9EDC9] hover:bg-[#E9EDC9]")}
              >
                {cat}
              </button>
            )
          })}
        </div>
      </div>

      <button 
        onClick={() => onSubmit(gender, interests)}
        disabled={!isValid || isProcessing}
        className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-bold shadow-xl hover:bg-[#4A4A30] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2 mt-8"
      >
        {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <>{isEditing ? '설정 저장하기' : '주파수 맞추기 완료'} <ArrowRightIcon /></>}
      </button>
    </div>
  );
}

function WriteForm({ type, isProcessing, onSubmit }: { type: 'worry'|'reply', isProcessing: boolean, onSubmit: (content: string, categories?: string[]) => void }) {
  const [content, setContent] = useState('');
  const [categories, setCategories] = useState<string[]>([]);

  const toggleCategory = (cat: string) => {
    if (categories.includes(cat)) {
      setCategories(categories.filter(c => c !== cat));
    } else {
      setCategories([...categories, cat]);
    }
  };

  const charCount = content.replace(/\s/g, '').length;
  const isLengthValid = charCount >= 10;
  const isValid = isLengthValid && (type === 'reply' || categories.length > 0);

  return (
    <div className="space-y-6">
      {type === 'worry' && (
        <div className="space-y-3 mb-6">
          <label className="font-bold text-sm text-[#5A5A40]">이 고민의 알맞은 주제를 골라주세요 (중복 선택 가능)</label>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map(cat => (
              <button 
                key={cat} onClick={() => toggleCategory(cat)}
                className={cn(
                  "px-4 py-2 rounded-full border text-xs font-bold transition-all", 
                  categories.includes(cat) ? "bg-[#D4A373] text-white border-[#D4A373]" : "bg-white text-[#8B8B6B] border-[#E9EDC9]"
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="relative">
        <textarea 
          value={content} onChange={e => setContent(e.target.value)}
          placeholder={type === 'worry' ? "오늘 하루 속상했던 일, 불안했던 생각들을 편하게 털어놓으세요." : "따뜻한 위로의 말을 남겨주세요."}
          className="w-full h-48 bg-white p-6 rounded-2xl border border-[#FAEDCD] resize-none focus:outline-none focus:ring-2 focus:ring-[#D4A373] placeholder:text-[#E9EDC9] leading-loose shadow-inner"
        />
        <div className="absolute bottom-4 right-6 text-xs font-medium text-[#8B8B6B]">
          {isLengthValid ? (
            <span className="text-[#A3B18A]">{charCount}자 작성됨</span>
          ) : (
            <span className="text-[#E07A5F]">최소 10자 이상 작성해주세요 (공백 제외 {charCount}자)</span>
          )}
        </div>
      </div>

      <div className="bg-[#E9EDC9]/30 p-4 rounded-xl flex gap-3 items-start border border-[#E9EDC9]">
        <Sparkles className="w-5 h-5 text-[#A3B18A] flex-shrink-0 mt-0.5" />
        <p className="text-xs text-[#8B8B6B] leading-relaxed">
          <strong>AI 안심 필터 적용 안내</strong><br/>
          입력하신 내용은 전송을 누르는 순간, AI 엔진을 통해 부적절한 언어가 감지되는지 확인합니다.<br/>문제가 없다면 상대방에게 원문 그대로 전달되니 편하게 적어주세요.
        </p>
      </div>

      <button 
        disabled={!isValid || isProcessing}
        onClick={() => onSubmit(content, type === 'worry' ? categories : undefined)}
        className="w-full py-4 bg-[#5A5A40] text-white rounded-xl font-bold shadow-xl hover:bg-[#4A4A30] disabled:opacity-50 transition-all flex items-center justify-center gap-3"
      >
        {isProcessing ? <><Loader2 className="w-5 h-5 animate-spin" /> 전송 중...</> : <><Send className="w-5 h-5" /> 송출하기</>}
      </button>
    </div>
  );
}

function ArrowRightIcon() { return <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg> }

function Tabs({ tabs, render }: { tabs: {id: string, label: string}[], render: (active: string) => React.ReactNode }) {
  const [active, setActive] = useState(tabs[0].id);
  
  return (
    <div>
      <div className="flex border-b border-[#E9EDC9]">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActive(tab.id)}
            className={cn(
              "flex-1 py-4 text-sm font-bold text-center border-b-2 transition-colors",
              active === tab.id ? "border-[#E07A5F] text-[#E07A5F]" : "border-transparent text-[#8B8B6B] hover:text-[#5A5A40]"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {render(active)}
    </div>
  );
}

import { processComment } from './services/geminiService';

function CommentForm({ replyId, onCommentAdded }: { replyId: string, onCommentAdded: (c: string) => void }) {
  const [content, setContent] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  
  const charCount = content.replace(/\s/g, '').length;
  const isLengthValid = charCount >= 10;

  const submitComment = async () => {
    if (!isLengthValid) return;
    setIsProcessing(true);
    try {
      const result = await processComment(content);
      if (result.status === 'rejected') {
        alert("부적절한 표현이 감지되었습니다. 내용을 수정해주세요."); // Fallback alert for simplicity inside component
        setIsProcessing(false);
        return;
      }
      await updateDoc(doc(db, 'letters', replyId), { publisherComment: content });
      onCommentAdded(content);
    } catch (e) {
      console.error(e);
      alert("전송 실패");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="relative">
        <textarea 
          value={content} onChange={e => setContent(e.target.value)}
          placeholder="따뜻한 코멘트를 남겨주세요. (10자 이상)"
          className="w-full h-32 bg-[#FDFCF8] p-4 rounded-xl border border-[#FAEDCD] resize-none focus:outline-none focus:ring-2 focus:ring-[#D4A373] text-sm"
        />
        <div className="absolute bottom-3 right-4 text-[10px] font-medium text-[#8B8B6B]">
          {isLengthValid ? <span className="text-[#A3B18A]">{charCount}자 작성됨</span> : <span className="text-[#E07A5F]">{charCount}/10자</span>}
        </div>
      </div>
      
      <button 
        disabled={!isLengthValid || isProcessing}
        onClick={submitComment}
        className="w-full py-3 bg-[#5A5A40] text-white rounded-xl font-bold hover:bg-[#4A4A30] disabled:opacity-50 transition-all text-sm"
      >
        {isProcessing ? '검토 및 전송 중...' : '코멘트 남기기'}
      </button>
    </div>
  );
}
