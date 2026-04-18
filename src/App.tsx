/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useRef } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  User as FirebaseUser,
  signOut
} from 'firebase/auth';
import { 
  collection, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp, 
  getDocs,
  doc,
  updateDoc,
  orderBy,
  limit,
  Timestamp,
  setDoc,
  getDoc
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { refineLetter } from './services/geminiService';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Mail, 
  Inbox, 
  Heart, 
  User as UserIcon, 
  LogOut, 
  Loader2, 
  ChevronRight, 
  ArrowLeft,
  Sparkles,
  Radio,
  Headphones,
  Mic2,
  Signal,
  RadioReceiver
} from 'lucide-react';
import { cn } from './lib/utils';

// --- Types ---
interface Letter {
  id: string;
  senderId: string;
  receiverId: string;
  originalContent: string;
  refinedContent: string;
  type: 'worry' | 'reply';
  replyTo?: string;
  replyToContent?: string;
  createdAt: Timestamp;
  isRead: boolean;
}

interface UserProfile {
  uid: string;
  displayName: string;
  photoURL?: string;
}

// --- Components ---

export default function App() {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'home' | 'write' | 'inbox' | 'read'>('home');
  const [letters, setLetters] = useState<Letter[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<Letter | null>(null);
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeUsers, setActiveUsers] = useState(1);
  const [notificationPermission, setNotificationPermission] = useState<string>(
    'Notification' in window ? Notification.permission : 'denied'
  );

  const requestNotificationPermission = async () => {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
      setUser(currentUser);
      if (currentUser) {
        // Ensure user document exists
        const userRef = doc(db, 'users', currentUser.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          await setDoc(userRef, {
            uid: currentUser.uid,
            displayName: currentUser.displayName || '익명의 유저',
            photoURL: currentUser.photoURL,
            createdAt: serverTimestamp(),
            lastActive: serverTimestamp()
          });
        }
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Presence Updater
  useEffect(() => {
    if (!user) return;
    const updatePresence = async () => {
      try {
        await updateDoc(doc(db, 'users', user.uid), {
          lastActive: serverTimestamp()
        });
      } catch (e) {
        console.error("Presence update failed", e);
      }
    };
    updatePresence(); // Initial update
    const interval = setInterval(updatePresence, 60000); // Every 1 min
    return () => clearInterval(interval);
  }, [user]);

  // Active Users Listener
  useEffect(() => {
    if (!user) return;
    const twoMinsAgo = Timestamp.fromDate(new Date(Date.now() - 2 * 60 * 1000));
    const q = query(
      collection(db, 'users'),
      where('lastActive', '>=', twoMinsAgo)
    );
    const unsubscribe = onSnapshot(q, (snap) => {
      setActiveUsers(Math.max(1, snap.size));
    });
    return () => unsubscribe();
  }, [user]);

  // Letters Listener
  const initialLoadRef = useRef(true);

  useEffect(() => {
    if (!user) {
      setLetters([]);
      initialLoadRef.current = true;
      return;
    }

    const q = query(
      collection(db, 'letters'),
      where('receiverId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Handle OS Notifications for newly added docs
      if (!initialLoadRef.current) {
        snapshot.docChanges().forEach((change) => {
          if (change.type === 'added') {
            const data = change.doc.data();
            // Only notify if we have permission
            if ('Notification' in window && Notification.permission === 'granted') {
              const originString = data.type === 'worry' ? '새로운 고민 사연' : '새로운 따뜻한 응답';
              const bodyString = data.refinedContent?.length > 40 
                ? data.refinedContent.substring(0, 40) + '...'
                : data.refinedContent;
              
              new Notification(`📻 미드나잇 라디오 : ${originString}`, {
                body: bodyString,
              });
            }
          }
        });
      }

      const newLetters = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as Letter[];
      setLetters(newLetters);

      // Set initial load to false after first process
      if (initialLoadRef.current) {
        initialLoadRef.current = false;
      }
    }, (err) => {
      console.error("Firestore Error:", err);
      setError("편지를 불러오는 중 오류가 발생했습니다.");
    });

    return () => unsubscribe();
  }, [user]);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Login Error:", err);
      setError("로그인에 실패했습니다.");
    }
  };

  const handleLogout = () => signOut(auth);

  const sendLetter = async (originalContent: string, refinedContent: string, type: 'worry' | 'reply', replyToId?: string, replyToContent?: string) => {
    if (!user) return;
    setIsSending(true);
    setError(null);

    try {
      if (type === 'worry') {
        const usersSnap = await getDocs(query(collection(db, 'users'), limit(100)));
        let otherUsers = usersSnap.docs
          .map(d => d.id)
          .filter(id => id !== user.uid);
        
        // 다수의 랜덤 유저 (최대 30명)에게 발송
        otherUsers = otherUsers.sort(() => 0.5 - Math.random()).slice(0, 30);
        
        if (otherUsers.length === 0) {
          otherUsers = [user.uid]; // Fallback
        }

        const promises = otherUsers.map(receiverId => 
          addDoc(collection(db, 'letters'), {
            senderId: user.uid,
            receiverId,
            originalContent,
            refinedContent,
            type,
            createdAt: serverTimestamp(),
            isRead: false
          })
        );
        await Promise.all(promises);
      } else {
        // It's a reply, receiver is the original sender
        let receiverId = '';
        const originalLetter = letters.find(l => l.id === replyToId);
        if (originalLetter) {
          receiverId = originalLetter.senderId;
        }

        await addDoc(collection(db, 'letters'), {
          senderId: user.uid,
          receiverId,
          originalContent,
          refinedContent,
          type,
          replyTo: replyToId || null,
          replyToContent: replyToContent || null,
          createdAt: serverTimestamp(),
          isRead: false
        });
      }

      setView('home');
      setSelectedLetter(null);
    } catch (err) {
      console.error("Send Error:", err);
      setError("편지를 보내는 중 오류가 발생했습니다.");
    } finally {
      setIsSending(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#D4A373] animate-spin" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#FDFCF8] flex flex-col items-center justify-center p-6 text-center">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md"
        >
          <div className="w-20 h-20 bg-[#FAEDCD] rounded-full flex items-center justify-center mx-auto mb-8 shadow-sm">
            <Radio className="w-10 h-10 text-[#D4A373]" />
          </div>
          <h1 className="text-4xl font-serif font-bold text-[#5A5A40] mb-4 tracking-tight">Midnight Radio</h1>
          <p className="text-[#8B8B6B] mb-12 leading-relaxed">
            당신의 깊은 고민을 주파수에 실어보세요.<br />
            AI가 당신의 이야기를 다듬어 누군가에게 송출합니다.
          </p>
          <button 
            onClick={handleLogin}
            className="w-full py-4 bg-[#D4A373] text-white rounded-2xl font-medium shadow-lg shadow-[#D4A373]/20 hover:bg-[#C29262] transition-all flex items-center justify-center gap-3"
          >
            Google로 시작하기
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#FDFCF8] text-[#5A5A40] font-sans selection:bg-[#FAEDCD]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-[#FDFCF8]/80 backdrop-blur-md z-50 border-b border-[#E9EDC9]/50">
        <div className="max-w-2xl mx-auto px-6 h-16 flex items-center justify-between">
          <button 
            onClick={() => setView('home')}
            className="text-xl font-serif font-bold tracking-tight text-[#D4A373]"
          >
            Midnight Radio
          </button>
          <div className="flex items-center gap-2 sm:gap-4">
            {notificationPermission === 'default' && (
              <button
                onClick={requestNotificationPermission}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 bg-[#E07A5F] text-white rounded-full text-xs font-medium shadow-sm hover:bg-[#D46A4F] transition-colors"
                title="새로운 사연이나 답장이 오면 푸시 알림을 받습니다."
              >
                <Signal className="w-3 h-3" />
                알림 켜기
              </button>
            )}
            <div className="flex items-center gap-1.5 sm:gap-2 px-2 sm:px-3 py-1.5 bg-[#FAEDCD]/50 rounded-full text-[10px] sm:text-xs font-medium text-[#8B8B6B]">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#A3B18A] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-[#A3B18A]"></span>
              </span>
              {activeUsers}명 청취 중
            </div>
            <button 
              onClick={() => setView('inbox')}
              className="relative p-2 hover:bg-[#FAEDCD] rounded-full transition-colors"
            >
              <Headphones className="w-6 h-6" />
              {letters.filter(l => !l.isRead).length > 0 && (
                <span className="absolute top-1 right-1 w-2.5 h-2.5 bg-[#E07A5F] rounded-full border-2 border-[#FDFCF8]" />
              )}
            </button>
            <button 
              onClick={handleLogout}
              className="p-2 hover:bg-[#FAEDCD] rounded-full transition-colors"
            >
              <LogOut className="w-5 h-5" />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto pt-24 pb-32 px-6">
        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              className="space-y-8"
            >
              <div className="bg-[#FAEDCD] p-8 rounded-[2rem] shadow-sm relative overflow-hidden group">
                <div className="relative z-10">
                  <h2 className="text-2xl font-serif font-bold mb-2">오늘 밤, 어떤 이야기가 있나요?</h2>
                  <p className="text-[#8B8B6B] mb-6">누구에게도 말하지 못한 고민을 주파수에 실어 보내보세요.</p>
                  <button 
                    onClick={() => setView('write')}
                    className="px-6 py-3 bg-[#D4A373] text-white rounded-xl font-medium shadow-md hover:bg-[#C29262] transition-all flex items-center gap-2"
                  >
                    사연 송출하기 <Signal className="w-4 h-4" />
                  </button>
                </div>
                <div className="absolute -right-4 -bottom-4 opacity-10 group-hover:scale-110 transition-transform duration-700">
                  <Mic2 className="w-48 h-48" />
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h3 className="font-serif font-bold text-lg">최근 수신된 주파수</h3>
                  <button onClick={() => setView('inbox')} className="text-sm text-[#D4A373] font-medium flex items-center gap-1">
                    주파수 목록 <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
                
                {letters.length === 0 ? (
                  <div className="text-center py-12 bg-white/50 rounded-3xl border border-dashed border-[#E9EDC9]">
                    <RadioReceiver className="w-12 h-12 text-[#E9EDC9] mx-auto mb-3" />
                    <p className="text-[#8B8B6B]">아직 수신된 사연이 없어요.</p>
                  </div>
                ) : (
                  <div className="grid gap-4">
                    {letters.slice(0, 3).map(letter => (
                      <LetterCard 
                        key={letter.id} 
                        letter={letter} 
                        onClick={() => {
                          setSelectedLetter(letter);
                          setView('read');
                        }} 
                      />
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {view === 'write' && (
            <motion.div 
              key="write"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
            >
              <button onClick={() => setView('home')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 돌아가기
              </button>
              <WriteLetterForm 
                onSend={(original, refined) => sendLetter(original, refined, 'worry')} 
                isSending={isSending} 
              />
            </motion.div>
          )}

          {view === 'inbox' && (
            <motion.div 
              key="inbox"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
            >
              <button onClick={() => setView('home')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 돌아가기
              </button>
              <h2 className="text-2xl font-serif font-bold mb-6 px-2">수신된 주파수</h2>
              <div className="grid gap-4">
                {letters.map(letter => (
                  <LetterCard 
                    key={letter.id} 
                    letter={letter} 
                    onClick={() => {
                      setSelectedLetter(letter);
                      setView('read');
                    }} 
                  />
                ))}
              </div>
            </motion.div>
          )}

          {view === 'read' && selectedLetter && (
            <motion.div 
              key="read"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
            >
              <button onClick={() => setView('inbox')} className="mb-6 flex items-center gap-2 text-[#8B8B6B] hover:text-[#5A5A40] transition-colors">
                <ArrowLeft className="w-4 h-4" /> 목록으로
              </button>
              <ReadLetter 
                letter={selectedLetter} 
                onReply={(original, refined) => sendLetter(original, refined, 'reply', selectedLetter.id, selectedLetter.refinedContent)}
                isSending={isSending}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-[#E07A5F] text-white px-6 py-3 rounded-full shadow-lg z-[100]"
          >
            {error}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

function LetterCard({ letter, onClick }: { letter: Letter, onClick: () => void, key?: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full text-left p-6 rounded-3xl transition-all border",
        letter.isRead 
          ? "bg-white border-[#E9EDC9]/50 opacity-80" 
          : "bg-white border-[#D4A373]/30 shadow-sm hover:shadow-md hover:border-[#D4A373]/50"
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center",
            letter.type === 'worry' ? "bg-[#FAEDCD]" : "bg-[#E9EDC9]"
          )}>
            {letter.type === 'worry' ? <Mic2 className="w-4 h-4 text-[#D4A373]" /> : <Heart className="w-4 h-4 text-[#A3B18A]" />}
          </div>
          <span className="text-xs font-bold uppercase tracking-wider text-[#8B8B6B]">
            {letter.type === 'worry' ? '누군가의 사연' : '따뜻한 응답'}
          </span>
        </div>
        <span className="text-[10px] text-[#A3B18A]">
          {letter.createdAt?.toDate().toLocaleDateString()}
        </span>
      </div>
      {letter.type === 'reply' && letter.replyToContent && (
        <div className="mb-3 px-3 py-2 bg-[#FAEDCD]/30 rounded-xl border border-[#FAEDCD]/50">
          <p className="text-[10px] text-[#D4A373] font-bold mb-1">내가 보냈던 사연</p>
          <p className="text-xs text-[#8B8B6B] line-clamp-1 italic">"{letter.replyToContent}"</p>
        </div>
      )}
      <p className="text-[#5A5A40] line-clamp-2 leading-relaxed italic font-serif">
        "{letter.refinedContent}"
      </p>
    </button>
  );
}

function WriteLetterForm({ onSend, isSending }: { onSend: (original: string, refined: string) => void, isSending: boolean }) {
  const [content, setContent] = useState('');
  const [refined, setRefined] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  const handleRefine = async () => {
    setIsRefining(true);
    const result = await refineLetter(content, 'worry');
    setRefined(result);
    setIsRefining(false);
  };

  return (
    <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-[#E9EDC9]">
      <div className="flex items-center gap-2 mb-6">
        <Mic2 className="w-5 h-5 text-[#D4A373]" />
        <h3 className="text-xl font-serif font-bold">마음을 담은 사연</h3>
      </div>
      <textarea 
        value={content}
        onChange={(e) => { setContent(e.target.value); setRefined(''); }}
        placeholder="오늘 하루의 고민이나 생각을 자유롭게 적어주세요. AI가 당신의 이야기를 따뜻한 라디오 사연처럼 다듬어 익명의 청취자에게 송출합니다."
        className="w-full h-64 p-6 bg-[#FDFCF8] rounded-2xl border-none focus:ring-2 focus:ring-[#FAEDCD] resize-none text-[#5A5A40] leading-relaxed placeholder:text-[#8B8B6B]/50 font-serif italic"
      />
      
      <AnimatePresence>
        {refined && (
          <motion.div 
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-4 overflow-hidden"
          >
            <div className="p-5 bg-[#FAEDCD]/30 rounded-2xl border border-[#FAEDCD]">
              <p className="text-xs text-[#D4A373] mb-2 font-bold flex items-center gap-1">
                <Signal className="w-3 h-3" /> 이렇게 다듬어져서 송출됩니다
              </p>
              <p className="font-serif italic text-[#5A5A40] whitespace-pre-wrap leading-relaxed">{refined}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="mt-6 flex items-center justify-between">
        <p className="text-xs text-[#8B8B6B] flex items-center gap-2">
          <span>{content.length} / 500자</span>
          {content.length < 10 && (
            <span className="text-[#E07A5F] font-medium">(최소 10자 이상 작성해주세요)</span>
          )}
        </p>
        {!refined ? (
          <button 
            disabled={isRefining || content.length < 10}
            onClick={handleRefine}
            className="px-6 py-3 bg-[#E9EDC9] text-[#5A5A40] rounded-xl font-bold shadow-sm hover:bg-[#DCE3B3] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Sparkles className="w-4 h-4" /> 주파수 다듬기</>}
          </button>
        ) : (
          <button 
            disabled={isSending}
            onClick={() => onSend(content, refined)}
            className="px-8 py-3 bg-[#D4A373] text-white rounded-xl font-medium shadow-md hover:bg-[#C29262] disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2"
          >
            {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Signal className="w-4 h-4" /> 주파수 송출하기</>}
          </button>
        )}
      </div>
    </div>
  );
}

function ReadLetter({ letter, onReply, isSending }: { letter: Letter, onReply: (original: string, refined: string) => void, isSending: boolean }) {
  const [showReply, setShowReply] = useState(false);
  const [replyContent, setReplyContent] = useState('');
  const [refinedReply, setRefinedReply] = useState('');
  const [isRefining, setIsRefining] = useState(false);

  useEffect(() => {
    if (!letter.isRead) {
      updateDoc(doc(db, 'letters', letter.id), { isRead: true });
    }
  }, [letter]);

  const handleRefine = async () => {
    setIsRefining(true);
    const result = await refineLetter(replyContent, 'reply');
    setRefinedReply(result);
    setIsRefining(false);
  };

  return (
    <div className="space-y-6">
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="bg-white p-10 rounded-[2.5rem] shadow-sm border border-[#E9EDC9] relative"
      >
        <div className="absolute top-8 right-8 opacity-10">
          <Radio className="w-16 h-16" />
        </div>
        <div className="mb-8 flex items-center gap-3">
          <div className="w-10 h-10 bg-[#FAEDCD] rounded-full flex items-center justify-center">
            <Headphones className="w-5 h-5 text-[#D4A373]" />
          </div>
          <div>
            <p className="text-xs font-bold text-[#8B8B6B] uppercase tracking-widest">익명의 청취자로부터</p>
            <p className="text-[10px] text-[#A3B18A]">{letter.createdAt?.toDate().toLocaleString()}</p>
          </div>
        </div>

        {letter.type === 'reply' && letter.replyToContent && (
          <div className="mb-8 p-5 bg-[#FAEDCD]/30 rounded-2xl border border-[#FAEDCD]">
            <p className="text-xs text-[#D4A373] mb-2 font-bold flex items-center gap-1">
              <Mic2 className="w-3 h-3" /> 내가 보냈던 사연
            </p>
            <p className="font-serif italic text-[#8B8B6B] leading-relaxed">
              "{letter.replyToContent}"
            </p>
          </div>
        )}

        <div className="space-y-6">
          <p className="text-xl text-[#5A5A40] leading-loose font-serif italic whitespace-pre-wrap">
            {letter.refinedContent}
          </p>
        </div>
        {!showReply && letter.type === 'worry' && (
          <div className="mt-12 pt-8 border-t border-[#E9EDC9]/50 flex justify-center">
            <button 
              onClick={() => setShowReply(true)}
              className="px-8 py-3 bg-[#FAEDCD] text-[#5A5A40] rounded-xl font-bold hover:bg-[#FEFAE0] transition-all flex items-center gap-2"
            >
              <Heart className="w-4 h-4 text-[#E07A5F]" /> 응답하기
            </button>
          </div>
        )}
      </motion.div>

      <AnimatePresence>
        {showReply && (
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className="bg-[#FEFAE0] p-8 rounded-[2rem] border border-[#E9EDC9]"
          >
            <h4 className="font-serif font-bold mb-4 flex items-center gap-2">
              <Heart className="w-4 h-4 text-[#E07A5F]" /> 따뜻한 응답 건네기
            </h4>
            <textarea 
              value={replyContent}
              onChange={(e) => { setReplyContent(e.target.value); setRefinedReply(''); }}
              placeholder="사연을 보낸 이에게 힘이 될 수 있는 따뜻한 응답을 적어주세요."
              className="w-full h-40 p-5 bg-white/50 rounded-2xl border-none focus:ring-2 focus:ring-[#D4A373]/20 resize-none text-[#5A5A40] leading-relaxed font-serif italic"
            />
            
            <AnimatePresence>
              {refinedReply && (
                <motion.div 
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-4 overflow-hidden"
                >
                  <div className="p-5 bg-white/60 rounded-2xl border border-[#FAEDCD]">
                    <p className="text-xs text-[#E07A5F] mb-2 font-bold flex items-center gap-1">
                      <Signal className="w-3 h-3" /> 이렇게 다듬어져서 송출됩니다
                    </p>
                    <p className="font-serif italic text-[#5A5A40] whitespace-pre-wrap leading-relaxed">{refinedReply}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-[#8B8B6B] flex items-center gap-2">
                <span>{replyContent.length} / 500자</span>
                {replyContent.length < 10 && (
                  <span className="text-[#E07A5F] font-medium">(최소 10자 이상 작성해주세요)</span>
                )}
              </p>
              <div className="flex justify-end gap-3">
                <button 
                  onClick={() => { setShowReply(false); setReplyContent(''); setRefinedReply(''); }}
                  className="px-6 py-2 text-[#8B8B6B] font-medium"
                >
                  취소
                </button>
                {!refinedReply ? (
                  <button 
                    disabled={isRefining || replyContent.length < 10}
                    onClick={handleRefine}
                    className="px-6 py-2 bg-[#E9EDC9] text-[#5A5A40] rounded-xl font-bold shadow-sm hover:bg-[#DCE3B3] disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isRefining ? <Loader2 className="w-4 h-4 animate-spin" /> : '주파수 다듬기'}
                  </button>
                ) : (
                  <button 
                    disabled={isSending}
                    onClick={() => onReply(replyContent, refinedReply)}
                    className="px-8 py-2 bg-[#D4A373] text-white rounded-xl font-medium shadow-md hover:bg-[#C29262] disabled:opacity-50 transition-all flex items-center gap-2"
                  >
                    {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : '응답 송출하기'}
                  </button>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
