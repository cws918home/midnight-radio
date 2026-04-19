import { initializeApp } from 'firebase/app';
import { initializeFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';
import fs from 'fs';
import path from 'path';

// Read config
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

const app = initializeApp(firebaseConfig);
// Explicitly use the database ID provided
const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}, 'ai-studio-5b923681-2d77-477b-ae6d-a04fc4c79fb2');

const CATEGORIES = ['취업', '진로', '학업', '시험', '소득', '주거', '연애', '결혼', '부모', '자녀', '우울', '불안', '외로움', '직장', '워라밸', '외모', '자존감', '건강', '노후', '미래'];

async function seed() {
  try {
    console.log("Adding public worry to Firestore (Named DB)...");
    const docRef = await addDoc(collection(db, 'letters'), {
      type: 'worry',
      receiverId: 'public',
      senderId: 'admin_system',
      originalContent: "요즘 매일매일이 뭔가 힘들어... 너무 공허한데 어떻게 해야할까?",
      refinedContent: "요즘 매일매일이 뭔가 힘들어... 너무 공허한데 어떻게 해야할까?",
      categories: CATEGORIES,
      category: CATEGORIES[0],
      createdAt: serverTimestamp(),
      isRead: false
    });
    console.log("Success! Public worry added with ID:", docRef.id);
    process.exit(0);
  } catch (error) {
    console.error("Error adding document:", error);
    process.exit(1);
  }
}

seed();
