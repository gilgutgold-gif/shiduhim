import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  Users, UserPlus, Heart, Search, Trash2, ChevronDown, ChevronUp, Sparkles, Save, 
  Briefcase, GraduationCap, MapPin, Camera, Smile, Quote, Cloud, Edit, X, FileText, Wand2,
  CheckCircle2, AlertCircle, Key, BrainCircuit, Send, Bot, User, MessageSquare, Loader, Settings
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query 
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";

// --- קבועים ---
const SYSTEM_PROMPT = `
You are a helpful Hebrew-speaking matchmaking assistant for an app called "Binyan Adei Ad".
Your goal is to extract profile data from the conversation.

Maintain the current state of the profile JSON.
When the user provides info, update the JSON fields.
If the user corrects you (e.g., "No, he is 25"), update the JSON accordingly.

Schema:
- firstName, lastName (Strings)
- gender ("male" or "female")
- age (Number)
- height (Number, cm)
- religiousLevel (String)
- currentOccupation (String)
- pastOccupations (String)
- lifeStage (String)
- origin (String)
- livingToday (String)
- aboutMe (String)
- lookingForText (String)
- contactName (String)
- highSchool (String)
- postHighSchool (String)
- moreDetails (String - for extra info not fitting elsewhere)

Output format:
1. Reply conversationally in Hebrew (short, friendly).
2. ALWAYS end your message with a code block containing the FULL updated JSON object.
Example:
"הבנתי, עדכנתי את הגיל ל-25. עוד משהו?"
\`\`\`json
{ ... full object ... }
\`\`\`
`;

const INITIAL_FORM_STATE = {
    firstName: '', lastName: '', gender: 'male', age: '', appearance: '', height: '',
    currentOccupation: '', pastOccupations: '', lifeStage: '', religiousLevel: '',
    aboutMe: '', lookingForText: '', origin: '', livingToday: '', interests: '',
    highSchool: '', postHighSchool: '', characterTraits: '', contactName: '', motto: '',
    moreDetails: '', 
    image: null, lookingForMinAge: '', lookingForMaxAge: '', lookingForReligiousLevel: ''
};

// --- פונקציית עזר לשיחה עם Gemini ---
const chatWithGemini = async (history, newMessage, apiKey) => {
  if (!apiKey) throw new Error("חסר מפתח API");

  const contents = [
    { role: "user", parts: [{ text: SYSTEM_PROMPT }] },
    ...history.map(msg => ({
      role: msg.role === 'user' ? 'user' : 'model',
      parts: [{ text: msg.content }]
    })),
    { role: "user", parts: [{ text: newMessage }] }
  ];

  try {
    // מנסים להשתמש ב-gemini-1.5-flash כי הוא המומלץ והמהיר ביותר כרגע
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        contents,
        safetySettings: [
            { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
            { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    const data = await response.json();
    
    if (!response.ok) {
        console.error("Gemini API Error Details:", data);
        if (data.error?.message?.includes("not found")) {
             throw new Error("המודל לא נמצא או שהמפתח לא תקין. נסה להחליף מפתח API.");
        }
        throw new Error(data.error?.message || `שגיאת שרת: ${response.status}`);
    }
    
    if (!data.candidates || data.candidates.length === 0) {
        throw new Error("המודל לא החזיר תשובה (ייתכן שנחסם בגלל סינון תוכן).");
    }

    const candidate = data.candidates[0];
    if (candidate.finishReason === "SAFETY") {
        throw new Error("התשובה נחסמה על ידי מסנני הבטיחות.");
    }

    const text = candidate.content?.parts?.[0]?.text;
    if (!text) {
        throw new Error("התקבל מבנה תשובה לא תקין.");
    }

    const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
    let extractedJson = null;
    let cleanText = text;

    if (jsonMatch) {
        try {
            extractedJson = JSON.parse(jsonMatch[1]);
            cleanText = text.replace(/```json[\s\S]*```/, '').trim();
        } catch (e) {
            console.error("Failed to parse JSON");
        }
    }

    return { text: cleanText, data: extractedJson };

  } catch (error) {
    console.error("AI Error:", error);
    throw error;
  }
};

// --- מסך הגדרה ראשוני ---
const SetupScreen = ({ onSave }) => {
  const [configInput, setConfigInput] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    try {
      setError('');
      let jsonStr = configInput.trim();
      const match = jsonStr.match(/{[\s\S]*}/);
      if (match) jsonStr = match[0];
      
      let config = null;
      try {
        config = JSON.parse(jsonStr.replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ').replace(/'/g, '"'));
      } catch (e) {
        throw new Error("שגיאה בפענוח ה-JSON.");
      }
      
      if (!config || !config.apiKey) throw new Error("חסר apiKey בקונפיגורציה.");
      onSave(config);
    } catch (e) { setError(e.message); }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl max-w-lg w-full space-y-6">
        <div className="text-center">
            <h1 className="text-3xl font-extrabold text-indigo-700">חיבור לענן המשפחתי</h1>
            <p className="text-gray-600 mt-2">אנא הזן את פרטי ה-Firebase כדי להתחיל.</p>
        </div>
        <textarea
          dir="ltr"
          className="w-full h-40 p-4 border rounded-xl font-mono text-xs bg-gray-900 text-green-400"
          placeholder={`{ "apiKey": "...", "projectId": "..." }`}
          value={configInput}
          onChange={(e) => setConfigInput(e.target.value)}
        />
        {error && <div className="text-red-600 text-sm font-bold">{error}</div>}
        <button onClick={handleSave} className="w-full py-4 bg-indigo-600 text-white font-bold rounded-xl">התחבר</button>
      </div>
    </div>
  );
};

// --- האפליקציה הראשית ---
export default function App() {
  const [firebaseConfig, setFirebaseConfig] = useState(() => {
    try {
        const saved = localStorage.getItem('firebase_config_shidduch');
        return saved ? JSON.parse(saved) : null;
    } catch (e) { return null; }
  });

  const [db, setDb] = useState(null);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null); 
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('database'); 
  const [selectedProfileForMatch, setSelectedProfileForMatch] = useState(null);
  const [expandedProfileId, setExpandedProfileId] = useState(null);
  
  const [formData, setFormData] = useState(INITIAL_FORM_STATE);
  const [editingId, setEditingId] = useState(null);
  
  const [geminiKey, setGeminiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [chatMessages, setChatMessages] = useState([
    { role: 'model', content: 'שלום! אני העוזר החכם של "בניין עדי עד". ספר לי על המועמד/ת ואני אצור כרטיס חדש בענן.' }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isAiLoading, setIsAiLoading] = useState(false);
  const [extractedProfilePreview, setExtractedProfilePreview] = useState(null);
  const chatEndRef = useRef(null);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterGender, setFilterGender] = useState('all');

  // --- אתחול Firebase ---
  useEffect(() => {
    if (!firebaseConfig) return;
    localStorage.setItem('firebase_config_shidduch', JSON.stringify(firebaseConfig));
    setAuthError(null); 

    try {
      const app = initializeApp(firebaseConfig);
      const authInstance = getAuth(app);
      const database = getFirestore(app);
      setDb(database);

      const initAuth = async () => {
         if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(authInstance, __initial_auth_token);
         } else {
            await signInAnonymously(authInstance);
         }
      };
      
      initAuth().catch((error) => {
        setAuthError(error.code === 'auth/api-key-not-valid' ? 'INVALID_KEY' : 'GENERAL');
      });

      const unsubscribeAuth = onAuthStateChanged(authInstance, (u) => {
        if (u) setUser(u);
      });
      return () => unsubscribeAuth();

    } catch (err) { setAuthError('INIT_FAILED'); }
  }, [firebaseConfig]);

  // --- סנכרון נתונים ---
  useEffect(() => {
    if (!db || !user) return;
    
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'FamilyShidduchDB';
    setLoading(true);
    const profilesCollection = collection(db, 'artifacts', appId, 'public', 'data', 'profiles');
    const q = query(profilesCollection);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedProfiles = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      loadedProfiles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setProfiles(loadedProfiles);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsubscribe();
  }, [db, user]);

  useEffect(() => {
    if (activeTab === 'chat_import') {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, activeTab]);

  // --- לוגיקה ---

  const handleSaveApiKey = (e) => {
      const val = e.target.value;
      setGeminiKey(val);
      localStorage.setItem('gemini_api_key', val);
  };

  const handleResetApiKey = () => {
      if (window.confirm('האם אתה בטוח שברצונך להחליף את מפתח ה-API?')) {
          setGeminiKey('');
          localStorage.removeItem('gemini_api_key');
      }
  };

  const handleSendMessage = async () => {
      if (!chatInput.trim() || !geminiKey) return;

      const userMsg = { role: 'user', content: chatInput };
      setChatMessages(prev => [...prev, userMsg]);
      setChatInput('');
      setIsAiLoading(true);

      try {
          const { text, data } = await chatWithGemini(chatMessages, userMsg.content, geminiKey);
          setChatMessages(prev => [...prev, { role: 'model', content: text }]);
          if (data) {
              setExtractedProfilePreview(prev => ({ ...(prev || {}), ...data }));
          }
      } catch (err) {
          console.error(err);
          const cleanError = err.message.replace('Error:', '').trim();
          setChatMessages(prev => [...prev, { role: 'model', content: `⚠️ שגיאה: ${cleanError}` }]);
      } finally {
          setIsAiLoading(false);
      }
  };

  const handleApproveAiProfile = () => {
      if (!extractedProfilePreview) return;
      setFormData(prev => ({ ...INITIAL_FORM_STATE, ...prev, ...extractedProfilePreview }));
      setActiveTab('add');
      setChatMessages([{ role: 'model', content: 'העברתי את הנתונים לטופס. מוכן לשמירה בענן!' }]);
      setExtractedProfilePreview(null);
  };

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!db) return;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'FamilyShidduchDB';
    const profileData = {
      ...formData,
      updatedAt: Date.now(),
      age: formData.age ? Number(formData.age) : '',
      height: formData.height ? Number(formData.height) : '',
      lookingFor: {
        minAge: Number(formData.lookingForMinAge) || (formData.age ? Number(formData.age) - 5 : 18),
        maxAge: Number(formData.lookingForMaxAge) || (formData.age ? Number(formData.age) + 5 : 99),
        religiousLevel: formData.lookingForReligiousLevel || formData.religiousLevel || ''
      }
    };

    try {
      setLoading(true);
      const profilesRef = collection(db, 'artifacts', appId, 'public', 'data', 'profiles');

      if (editingId) {
        await updateDoc(doc(profilesRef, editingId), profileData);
        alert('הכרטיס עודכן בענן!');
      } else {
        await addDoc(profilesRef, { ...profileData, createdAt: Date.now() });
        alert('הכרטיס נוצר בענן בהצלחה!');
      }
      resetForm();
      setActiveTab('database');
    } catch (err) { alert('שגיאה בשמירה לענן'); } finally { setLoading(false); }
  };

  const startEditing = (profile) => {
    setFormData({ ...INITIAL_FORM_STATE, ...profile });
    setEditingId(profile.id);
    setActiveTab('add');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setFormData(INITIAL_FORM_STATE);
    setEditingId(null);
  };

  const deleteProfile = async (id) => {
    if (!db) return;
    if (window.confirm('האם למחוק פרופיל זה מהענן?')) {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'FamilyShidduchDB';
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', id));
        if (selectedProfileForMatch?.id === id) setSelectedProfileForMatch(null);
        if (editingId === id) resetForm();
      } catch (err) { alert('שגיאה במחיקה'); }
    }
  };

  const handleResetConfig = () => {
    if(window.confirm('האם לאפס את חיבור הענן?')) {
      setFirebaseConfig(null);
      localStorage.removeItem('firebase_config_shidduch');
      setAuthError(null);
    }
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleImageUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setFormData(prev => ({ ...prev, image: reader.result }));
      reader.readAsDataURL(file);
    }
  };

  const calculateMatchScore = (candidate, target) => {
    let score = 0;
    if (candidate.gender === target.gender) return 0;
    
    const candAge = candidate.age || 20;
    const minAge = target.lookingFor?.minAge || 18;
    const maxAge = target.lookingFor?.maxAge || 99;
    
    if (candAge >= minAge && candAge <= maxAge) score += 40;
    else score += Math.max(0, 30 - (Math.min(Math.abs(candAge - minAge), Math.abs(candAge - maxAge)) * 5));

    if (candidate.religiousLevel && target.lookingFor?.religiousLevel) {
        if (candidate.religiousLevel === target.lookingFor.religiousLevel) score += 30;
        else if (candidate.religiousLevel.includes(target.lookingFor.religiousLevel) || 
                   target.lookingFor.religiousLevel.includes(candidate.religiousLevel)) score += 15;
    } else score += 10;
    return Math.min(100, score + 20);
  };

  const filteredProfiles = profiles.filter(p => {
    const fullName = `${p.firstName} ${p.lastName}`;
    const matchesSearch = fullName.includes(searchTerm) || p.origin?.includes(searchTerm);
    const matchesGender = filterGender === 'all' || p.gender === filterGender;
    return matchesSearch && matchesGender;
  });

  const matchesForSelected = profiles
      .map(p => ({ ...p, score: selectedProfileForMatch ? calculateMatchScore(p, selectedProfileForMatch) : 0 }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score);


  if (!firebaseConfig) return <SetupScreen onSave={setFirebaseConfig} />;

  if (authError) {
    return (
        <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full text-center">
                <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
                <h2 className="text-2xl font-bold text-gray-900">שגיאת התחברות ל-Firebase</h2>
                <button onClick={handleResetConfig} className="w-full mt-6 py-3 bg-gray-900 text-white font-bold rounded-xl">אפס הגדרות</button>
            </div>
        </div>
    );
  }

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 font-sans text-gray-800 pb-20">
      
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md sticky top-0 z-30 border-b border-white/20 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex flex-col md:flex-row justify-between items-center gap-4">
            <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('database')}>
              <div className="relative">
                <Heart className="text-rose-500 w-9 h-9 drop-shadow-lg" fill="currentColor" />
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-purple-600 leading-none">בניין עדי עד</h1>
                <p className="text-xs text-indigo-600 font-bold flex items-center gap-1 mt-1">
                  <Cloud className="w-3 h-3" /> מחובר לענן המשפחתי
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
               <div className="flex bg-gray-100/80 p-1.5 rounded-xl ml-2 shadow-inner">
                <button onClick={() => {resetForm(); setActiveTab('database');}} 
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'database' ? 'bg-white shadow text-blue-600 scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Users className="w-4 h-4" /> המאגר
                </button>
                <button onClick={() => setActiveTab('add')} 
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'add' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
                  {editingId ? <><Edit className="w-4 h-4" /> עריכה</> : <><UserPlus className="w-4 h-4" /> הוספה</>}
                </button>
                <button onClick={() => setActiveTab('chat_import')} 
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'chat_import' ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-md scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
                  <MessageSquare className="w-4 h-4" /> צ'אט AI
                </button>
                <button onClick={() => setActiveTab('match')} 
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'match' ? 'bg-white shadow text-rose-600 scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Sparkles className="w-4 h-4" /> התאמות
                </button>
              </div>
              <button onClick={handleResetConfig} className="p-2 text-gray-400 hover:bg-gray-100 rounded-full"><Settings className="w-5 h-5"/></button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        
        {loading && (
          <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
             <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center">
                <Loader className="w-10 h-10 animate-spin text-indigo-600 mb-2" />
                <span className="text-sm font-bold text-gray-600">טוען נתונים מהענן...</span>
             </div>
          </div>
        )}

        {/* --- VIEW: DATABASE --- */}
        {activeTab === 'database' && (
          <div className="space-y-8 animate-in fade-in duration-500">
             <div className="bg-white/80 backdrop-blur p-5 rounded-2xl shadow-sm border border-indigo-50 flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[240px]">
                <label className="text-xs font-bold text-indigo-900 mb-2 block">חיפוש מהיר</label>
                <div className="relative group">
                  <Search className="absolute right-3 top-3 w-5 h-5 text-indigo-300 group-focus-within:text-indigo-600 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="חפש שם, מקום, פרטים נוספים..." 
                    className="w-full pl-4 pr-10 py-2.5 border-2 border-indigo-50 rounded-xl focus:border-indigo-400 focus:ring-0 focus:outline-none bg-indigo-50/30 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="w-48">
                <label className="text-xs font-bold text-indigo-900 mb-2 block">סינון</label>
                <select className="w-full p-2.5 border-2 border-indigo-50 rounded-xl focus:border-indigo-400 outline-none bg-white" value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
                  <option value="all">הכל</option>
                  <option value="male">בחורים</option>
                  <option value="female">בחורות</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProfiles.length === 0 && !loading ? (
                 <div className="col-span-full py-20 text-center text-gray-400">
                    <Cloud className="w-16 h-16 mx-auto mb-4 text-gray-200" />
                    המאגר ריק כרגע. התחל ב"צ'אט AI" או ב"הוספה" כדי למלא אותו!
                 </div>
              ) : filteredProfiles.map(profile => (
                <div key={profile.id} className="group bg-white rounded-2xl shadow-sm border border-white hover:border-indigo-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden">
                    <div className="bg-gray-100 h-32 relative">
                         {profile.image ? (
                             <img src={profile.image} className="w-full h-full object-cover" />
                         ) : (
                             <div className="absolute inset-0 flex items-center justify-center">
                                 <Users className={`w-12 h-12 ${profile.gender === 'male' ? 'text-blue-300' : 'text-rose-300'}`} />
                             </div>
                         )}
                         <div className="absolute top-2 right-2 flex gap-1">
                            <button onClick={() => startEditing(profile)} className="p-1.5 bg-white/90 rounded-full text-indigo-600 hover:bg-white shadow-sm"><Edit className="w-4 h-4" /></button>
                            <button onClick={() => deleteProfile(profile.id)} className="p-1.5 bg-white/90 rounded-full text-red-500 hover:bg-white shadow-sm"><Trash2 className="w-4 h-4" /></button>
                         </div>
                    </div>
                    <div className="p-4">
                        <h3 className="text-lg font-bold">{profile.firstName} {profile.lastName}</h3>
                        <p className="text-sm text-gray-500">{profile.age} {profile.livingToday && `, ${profile.livingToday}`}</p>
                        <p className="text-xs mt-2 text-gray-400 line-clamp-2">{profile.aboutMe}</p>
                        <button onClick={() => {setSelectedProfileForMatch(profile); setActiveTab('match');}} className="mt-3 w-full bg-gray-900 text-white text-xs font-bold py-2 rounded-lg hover:bg-black transition-colors">מצא שידוך</button>
                    </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- VIEW: CHAT IMPORT --- */}
        {activeTab === 'chat_import' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[80vh]">
                
                {/* Right Side: Chat Interface */}
                <div className="lg:col-span-2 bg-white rounded-3xl shadow-xl flex flex-col overflow-hidden border border-gray-100">
                    <div className="bg-gradient-to-r from-purple-600 to-indigo-600 p-4 text-white flex justify-between items-center">
                        <div className="flex items-center gap-2">
                            <Bot className="w-6 h-6" />
                            <div>
                                <h3 className="font-bold">העוזר החכם (מחובר לענן)</h3>
                                <p className="text-xs opacity-80">ספר לי על המועמד, אני אסדר את הפרטים.</p>
                            </div>
                        </div>
                        {!geminiKey ? (
                            <div className="bg-red-500/20 px-2 py-1 rounded text-xs font-bold border border-red-400/30 flex items-center gap-1">
                                <Key className="w-3 h-3"/> חסר מפתח API
                            </div>
                        ) : (
                             <button onClick={handleResetApiKey} className="bg-white/20 hover:bg-white/30 px-2 py-1 rounded text-xs font-bold border border-white/30 flex items-center gap-1 transition-colors" title="החלף מפתח API">
                                <Key className="w-3 h-3"/> החלף מפתח
                            </button>
                        )}
                    </div>

                    <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-gray-50/50">
                        {chatMessages.map((msg, idx) => (
                            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                <div className={`max-w-[80%] p-4 rounded-2xl shadow-sm ${
                                    msg.role === 'user' 
                                    ? 'bg-indigo-600 text-white rounded-br-none' 
                                    : 'bg-white border border-gray-200 text-gray-800 rounded-bl-none'
                                }`}>
                                    <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
                                </div>
                            </div>
                        ))}
                        {isAiLoading && (
                            <div className="flex justify-start">
                                <div className="bg-white border border-gray-200 p-3 rounded-2xl rounded-bl-none shadow-sm flex items-center gap-2">
                                    <Sparkles className="w-4 h-4 text-purple-500 animate-spin" />
                                    <span className="text-xs text-gray-500">מקליד/ה...</span>
                                </div>
                            </div>
                        )}
                        <div ref={chatEndRef} />
                    </div>

                    <div className="p-4 bg-white border-t border-gray-100">
                         {!geminiKey ? (
                             <div className="flex gap-2">
                                 <input 
                                    type="password" 
                                    value={geminiKey} 
                                    onChange={handleSaveApiKey} 
                                    placeholder="הדבק כאן מפתח Gemini API כדי להתחיל..."
                                    className="flex-1 p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-purple-500 outline-none text-sm"
                                 />
                                 <a href="https://aistudio.google.com/app/apikey" target="_blank" className="p-3 bg-gray-100 text-gray-600 rounded-xl hover:bg-gray-200 text-sm font-bold whitespace-nowrap">השג מפתח</a>
                             </div>
                         ) : (
                             <div className="flex gap-2">
                                 <input 
                                    type="text" 
                                    value={chatInput}
                                    onChange={(e) => setChatInput(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                                    placeholder="כתוב כאן... (לדוגמה: בחור בן 24 מירושלים...)"
                                    className="flex-1 p-3 border rounded-xl bg-gray-50 focus:ring-2 focus:ring-purple-500 outline-none"
                                 />
                                 <button 
                                    onClick={handleSendMessage}
                                    disabled={!chatInput.trim() || isAiLoading}
                                    className="p-3 bg-purple-600 text-white rounded-xl hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                                 >
                                    <Send className="w-5 h-5" />
                                 </button>
                             </div>
                         )}
                    </div>
                </div>

                {/* Left Side: Live Preview Card */}
                <div className="lg:col-span-1 flex flex-col gap-4">
                    <div className="bg-white p-6 rounded-3xl shadow-xl border-2 border-dashed border-purple-100 h-full flex flex-col">
                        <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                            <FileText className="w-5 h-5 text-purple-600"/> כרטיס בבנייה
                        </h3>
                        
                        {extractedProfilePreview ? (
                            <div className="flex-1 overflow-y-auto space-y-4 animate-in fade-in">
                                <div className="flex items-center gap-3 mb-4">
                                    <div className={`w-16 h-16 rounded-full flex items-center justify-center ${extractedProfilePreview.gender === 'male' ? 'bg-blue-100 text-blue-600' : 'bg-rose-100 text-rose-600'}`}>
                                        <User className="w-8 h-8" />
                                    </div>
                                    <div>
                                        <div className="font-bold text-lg">
                                            {extractedProfilePreview.firstName || '???'} {extractedProfilePreview.lastName}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            {extractedProfilePreview.age ? `בן/ת ${extractedProfilePreview.age}` : 'גיל לא ידוע'} 
                                            {extractedProfilePreview.livingToday ? `, מ${extractedProfilePreview.livingToday}` : ''}
                                        </div>
                                    </div>
                                </div>
                                
                                <div className="space-y-2 text-sm bg-gray-50 p-4 rounded-xl border border-gray-100">
                                    {extractedProfilePreview.height && <div><span className="font-bold">גובה:</span> {extractedProfilePreview.height}</div>}
                                    {extractedProfilePreview.religiousLevel && <div><span className="font-bold">רמה דתית:</span> {extractedProfilePreview.religiousLevel}</div>}
                                    {extractedProfilePreview.currentOccupation && <div><span className="font-bold">עיסוק:</span> {extractedProfilePreview.currentOccupation}</div>}
                                    {extractedProfilePreview.aboutMe && <div className="italic text-gray-600 mt-2">"{extractedProfilePreview.aboutMe}"</div>}
                                </div>
                                
                                {extractedProfilePreview.moreDetails && (
                                    <div className="text-xs bg-yellow-50 p-2 rounded text-yellow-800">
                                        <strong>עוד פרטים:</strong> {extractedProfilePreview.moreDetails}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 text-center p-4">
                                <Wand2 className="w-12 h-12 mb-2 opacity-50" />
                                <p>התחל בצ'אט כדי לראות את הכרטיס נבנה כאן בזמן אמת...</p>
                            </div>
                        )}

                        <button 
                            onClick={handleApproveAiProfile}
                            disabled={!extractedProfilePreview}
                            className="w-full mt-4 py-3 bg-green-600 text-white rounded-xl font-bold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 shadow-lg shadow-green-200 transition-all"
                        >
                            <CheckCircle2 className="w-5 h-5" /> אשר והעבר לטופס
                        </button>
                    </div>
                </div>
            </div>
        )}

        {/* --- VIEW: ADD/EDIT PROFILE (FORM) --- */}
        {activeTab === 'add' && (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <form onSubmit={handleSaveProfile} className="bg-white/90 backdrop-blur p-8 rounded-3xl shadow-xl border border-white space-y-8 relative">
              {editingId && (
                <button type="button" onClick={() => {resetForm(); setActiveTab('database')}} className="absolute top-6 left-6 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                    <X className="w-5 h-5 text-gray-600" />
                </button>
              )}
              <div className="text-center mb-8 border-b border-gray-100 pb-6 relative">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3 ${editingId ? 'bg-indigo-600' : 'bg-green-500'}`}>
                    {editingId ? <Edit className="w-8 h-8 text-white" /> : <UserPlus className="w-8 h-8 text-white" />}
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900">{editingId ? 'עריכת כרטיס' : 'יצירת כרטיס חדש'}</h2>
              </div>

              {/* טופס (זהה לגרסאות קודמות) */}
              <div className="space-y-6">
                 <div className="flex gap-6 mb-6 bg-indigo-50/50 p-6 rounded-2xl items-center justify-center border border-indigo-100">
                    <span className="font-bold text-indigo-900 text-lg">מין המועמד/ת:</span>
                    <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border-2 transition-all ${formData.gender === 'male' ? 'bg-white border-cyan-400 shadow-md scale-105' : 'border-transparent hover:bg-white/50'}`}>
                      <input type="radio" name="gender" value="male" checked={formData.gender === 'male'} onChange={handleInputChange} className="w-4 h-4 accent-cyan-600" />
                      <span className="font-bold text-cyan-700">בחור</span>
                    </label>
                    <label className={`flex items-center gap-2 cursor-pointer px-4 py-2 rounded-xl border-2 transition-all ${formData.gender === 'female' ? 'bg-white border-rose-400 shadow-md scale-105' : 'border-transparent hover:bg-white/50'}`}>
                      <input type="radio" name="gender" value="female" checked={formData.gender === 'female'} onChange={handleInputChange} className="w-4 h-4 accent-rose-600" />
                      <span className="font-bold text-rose-700">בחורה</span>
                    </label>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                   <div><label className="label">שם פרטי *</label><input required name="firstName" value={formData.firstName} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">שם משפחה *</label><input required name="lastName" value={formData.lastName} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">גיל</label><input type="number" name="age" value={formData.age} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">מראה חיצוני</label><input name="appearance" value={formData.appearance} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">גובה (ס"מ)</label><input type="number" name="height" value={formData.height} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">רמה דתית</label><input name="religiousLevel" value={formData.religiousLevel} onChange={handleInputChange} className="input-field" /></div>
                 </div>

                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-gray-100">
                    <div><label className="label">עיסוק נוכחי</label><input name="currentOccupation" value={formData.currentOccupation} onChange={handleInputChange} className="input-field" /></div>
                    <div><label className="label">מגורים</label><input name="livingToday" value={formData.livingToday} onChange={handleInputChange} className="input-field" /></div>
                    <div><label className="label">איש קשר</label><input name="contactName" value={formData.contactName} onChange={handleInputChange} className="input-field bg-yellow-50" /></div>
                    <div><label className="label">על עצמי</label><textarea name="aboutMe" rows="1" value={formData.aboutMe} onChange={handleInputChange} className="input-field" /></div>
                 </div>
                 
                 <div className="pt-4 border-t border-gray-100">
                     <label className="label">עוד פרטים (מידע שלא נכנס לשדות אחרים)</label>
                     <textarea name="moreDetails" rows="3" value={formData.moreDetails} onChange={handleInputChange} className="input-field bg-gray-50 text-gray-600" />
                 </div>
              </div>

              <div className="flex gap-4 pt-4">
                  <button type="submit" disabled={loading} className={`w-full py-4 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-lg hover:shadow-xl hover:scale-[1.01] transition-all ${editingId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-900 hover:bg-black'}`}>
                    <Save className="w-6 h-6" />
                    {loading ? 'שומר בענן...' : (editingId ? 'עדכן כרטיס' : 'שמור כרטיס בענן')}
                  </button>
              </div>
            </form>
          </div>
        )}

        {/* --- VIEW: MATCHMAKER --- */}
        {activeTab === 'match' && (
             <div className="text-center py-20 bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-white max-w-2xl mx-auto">
                {selectedProfileForMatch ? (
                    <div className="space-y-4">
                        <h2 className="text-2xl font-bold">מחפש שידוכים עבור: {selectedProfileForMatch.firstName}</h2>
                        <div className="grid gap-4 text-left">
                            {matchesForSelected.map(match => (
                                <div key={match.id} className="bg-gray-50 p-4 rounded-xl flex justify-between items-center border border-gray-200">
                                    <div>
                                        <div className="font-bold">{match.firstName} {match.lastName} ({match.age})</div>
                                        <div className="text-sm text-gray-500">{match.religiousLevel}</div>
                                    </div>
                                    <div className="text-green-600 font-bold">{Math.round(match.score)}%</div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        <h2 className="text-2xl font-bold mb-4">מערכת התאמות</h2>
                        <p>בחר כרטיס מהמאגר כדי להתחיל.</p>
                        <button onClick={() => setActiveTab('database')} className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg">למאגר</button>
                    </>
                )}
             </div>
        )}

      </main>
      
      <style>{`
        .input-field { width: 100%; padding: 0.75rem 1rem; border: 1px solid #e5e7eb; border-radius: 0.75rem; outline: none; background-color: #f9fafb; transition: all 0.2s; }
        .input-field:focus { background-color: #fff; border-color: #6366f1; box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); }
        .label { display: block; font-size: 0.875rem; font-weight: 700; color: #4b5563; margin-bottom: 0.35rem; }
        .scrollbar-hide::-webkit-scrollbar { display: none; }
        .scrollbar-hide { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>
    </div>
  );
}