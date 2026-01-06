import React, { useState, useEffect, useMemo } from 'react';
import { 
  Users, UserPlus, Heart, Search, Trash2, ChevronDown, ChevronUp, Sparkles, Save, 
  Briefcase, GraduationCap, MapPin, Camera, Smile, Quote, Cloud, Loader, Settings,
  AlertTriangle, HelpCircle, Edit, X
} from 'lucide-react';

// Firebase Imports
import { initializeApp } from "firebase/app";
import { 
  getFirestore, collection, addDoc, updateDoc, deleteDoc, doc, onSnapshot, query 
} from "firebase/firestore";
import { getAuth, signInAnonymously, onAuthStateChanged, signInWithCustomToken } from "firebase/auth";

// --- קבועים ---
const HIGH_SCHOOL_OPTIONS = ['אולפנה', 'ישיבה תיכונית', 'תיכון', 'סמינר'];
const POST_HIGH_SCHOOL_OPTIONS = ['הסדר', 'מכינה', 'גיוס', 'לימודים גבוהים', 'מדרשה', 'שירות לאומי', 'ישיבה גבוהה', 'כולל'];

// --- מסך הגדרה ראשוני ---
const SetupScreen = ({ onSave }) => {
  const [configInput, setConfigInput] = useState('');
  const [error, setError] = useState('');

  const handleSave = () => {
    try {
      setError('');
      let jsonStr = configInput.trim();
      
      const match = jsonStr.match(/{[\s\S]*}/);
      if (match) {
        jsonStr = match[0];
      }
      
      let config = null;

      try {
        config = JSON.parse(jsonStr);
      } catch (e1) {
        try {
            const fixedJson = jsonStr
                .replace(/(['"])?([a-zA-Z0-9_]+)(['"])?:/g, '"$2": ')
                .replace(/'/g, '"');
            config = JSON.parse(fixedJson);
        } catch (e2) {
            throw new Error("שגיאה בפענוח הטקסט. אנא וודא שהעתקת את התוכן המדויק.");
        }
      }
      
      if (!config || !config.apiKey || !config.projectId) {
        throw new Error("נראה שחסרים פרטים בקונפיגורציה (apiKey או projectId)");
      }
      
      onSave(config);
    } catch (e) {
      console.error(e);
      setError(e.message);
    }
  };

  return (
    <div dir="rtl" className="min-h-screen bg-gradient-to-br from-indigo-100 via-purple-50 to-pink-100 flex items-center justify-center p-4">
      <div className="bg-white/80 backdrop-blur-xl p-8 rounded-3xl shadow-2xl max-w-lg w-full space-y-6 border border-white/50">
        <div className="text-center">
          <div className="bg-gradient-to-r from-blue-500 to-indigo-600 w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-200">
            <Cloud className="w-10 h-10 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-gray-900 bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-indigo-600">חיבור לענן</h1>
          <p className="text-gray-600 mt-2 font-medium">הגדרת מסד הנתונים המשפחתי</p>
        </div>

        <div className="bg-amber-50 p-4 rounded-xl text-sm text-amber-900 border border-amber-100 shadow-sm">
          <strong>הוראות:</strong> לך להגדרות הפרויקט ב-Firebase, העתק את תוכן המשתנה <code>firebaseConfig</code> והדבק כאן.
        </div>

        <textarea
          dir="ltr"
          className="w-full h-40 p-4 border border-gray-200 rounded-xl font-mono text-xs bg-gray-900/95 text-green-400 focus:ring-4 focus:ring-blue-500/20 focus:border-blue-500 outline-none transition-all shadow-inner"
          placeholder={`{
  "apiKey": "...",
  "authDomain": "...",
  ...
}`}
          value={configInput}
          onChange={(e) => setConfigInput(e.target.value)}
        />

        {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm font-bold border border-red-100 flex items-start gap-2 animate-pulse">
                <span>⚠️</span>
                <span>{error}</span>
            </div>
        )}

        <button 
          onClick={handleSave}
          className="w-full py-4 bg-gradient-to-r from-blue-600 to-indigo-700 text-white font-bold rounded-xl hover:shadow-lg hover:scale-[1.02] transition-all duration-200 shadow-blue-200"
        >
          שמור והתחל
        </button>
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
    } catch (e) {
        return null;
    }
  });

  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [user, setUser] = useState(null);
  const [authError, setAuthError] = useState(null); 
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('database'); 
  const [selectedProfileForMatch, setSelectedProfileForMatch] = useState(null);
  const [expandedProfileId, setExpandedProfileId] = useState(null);
  
  // State for Editing
  const [editingId, setEditingId] = useState(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterGender, setFilterGender] = useState('all');

  // Form State
  const initialFormState = {
    firstName: '', lastName: '', gender: 'male', age: '', appearance: '', height: '',
    currentOccupation: '', pastOccupations: '', lifeStage: '', religiousLevel: '',
    aboutMe: '', lookingForText: '', origin: '', livingToday: '', interests: '',
    highSchool: '', postHighSchool: '', characterTraits: '', contactName: '', motto: '',
    image: null, lookingForMinAge: '', lookingForMaxAge: '', lookingForReligiousLevel: ''
  };

  const [formData, setFormData] = useState(initialFormState);

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
      setAuth(authInstance);

      const initAuth = async () => {
         if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(authInstance, __initial_auth_token);
         } else {
            await signInAnonymously(authInstance);
         }
      };
      
      initAuth().catch((error) => {
        console.error("Auth Error", error);
        if (error.code === 'auth/configuration-not-found' || error.code === 'auth/operation-not-allowed') {
            setAuthError('AUTH_DISABLED');
        } else if (error.code === 'auth/api-key-not-valid') {
            setAuthError('INVALID_KEY');
        } else {
            setAuthError('GENERAL');
        }
      });

      const unsubscribeAuth = onAuthStateChanged(authInstance, (u) => {
        if (u) {
          setUser(u);
          setAuthError(null); 
        }
      });
      
      return () => unsubscribeAuth();

    } catch (err) {
      console.error("Firebase Init Error", err);
      setAuthError('INIT_FAILED');
    }
  }, [firebaseConfig]);

  // --- האזנה לנתונים ---
  useEffect(() => {
    if (!db || !user) return;
    
    // בודק אם יש App ID גלובלי (מהסביבה של Gemini) או משתמש בברירת מחדל
    const appId = typeof __app_id !== 'undefined' ? __app_id : 'FamilyShidduchDB';

    setLoading(true);
    // שימוש בנתיב המותאם לדרישות (public/data)
    const profilesCollection = collection(db, 'artifacts', appId, 'public', 'data', 'profiles');
    const q = query(profilesCollection);

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const loadedProfiles = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      // מיון לפי זמן יצירה (חדש למעלה)
      loadedProfiles.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      setProfiles(loadedProfiles);
      setLoading(false);
    }, (error) => {
      console.error("Error fetching data:", error);
      if (error.code === 'permission-denied') {
          // זה בסדר לא להציג התראה קופצת, אלא רק לוג
          console.warn("Permission denied. Ensure Firestore rules are public for this path.");
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, [db, user]);

  // --- פונקציות לוגיקה ---

  const handleSaveProfile = async (e) => {
    e.preventDefault();
    if (!db) return;

    const appId = typeof __app_id !== 'undefined' ? __app_id : 'FamilyShidduchDB';
    const profileData = {
      ...formData,
      updatedAt: Date.now(),
      age: Number(formData.age),
      height: Number(formData.height),
      lookingFor: {
        minAge: Number(formData.lookingForMinAge) || (Number(formData.age) - 5),
        maxAge: Number(formData.lookingForMaxAge) || (Number(formData.age) + 5),
        religiousLevel: formData.lookingForReligiousLevel || formData.religiousLevel
      }
    };

    try {
      setLoading(true);
      const profilesRef = collection(db, 'artifacts', appId, 'public', 'data', 'profiles');

      if (editingId) {
        // Update existing
        await updateDoc(doc(profilesRef, editingId), profileData);
        alert('הכרטיס עודכן בהצלחה!');
      } else {
        // Create new
        await addDoc(profilesRef, {
            ...profileData,
            createdAt: Date.now() 
        });
        alert('הפרופיל נשמר בענן בהצלחה!');
      }
      
      resetForm();
      setActiveTab('database');

    } catch (err) {
      console.error(err);
      alert('שגיאה בשמירה לענן: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const startEditing = (profile) => {
    setFormData({
        ...profile,
        // Ensure nested lookingFor props are flattened back to form state if needed
        lookingForMinAge: profile.lookingFor?.minAge || '',
        lookingForMaxAge: profile.lookingFor?.maxAge || '',
        lookingForReligiousLevel: profile.lookingFor?.religiousLevel || ''
    });
    setEditingId(profile.id);
    setActiveTab('add');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const resetForm = () => {
    setFormData(initialFormState);
    setEditingId(null);
  };

  const deleteProfile = async (id) => {
    if (!db) return;
    if (window.confirm('האם אתה בטוח שברצונך למחוק פרופיל זה מהענן? (הוא יימחק לכולם)')) {
      const appId = typeof __app_id !== 'undefined' ? __app_id : 'FamilyShidduchDB';
      try {
        await deleteDoc(doc(db, 'artifacts', appId, 'public', 'data', 'profiles', id));
        if (selectedProfileForMatch?.id === id) setSelectedProfileForMatch(null);
        if (editingId === id) resetForm();
      } catch (err) {
        alert('שגיאה במחיקה');
      }
    }
  };

  const handleResetConfig = () => {
    if(window.confirm('האם לאפס את חיבור הענן? תצטרך להזין מחדש את המפתחות.')) {
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
      if (file.size > 150000) { 
        alert('שים לב: הקובץ גדול מדי. אנא בחר תמונה קטנה (עד 150KB) לביצועים מהירים.');
        return;
      }
      const reader = new FileReader();
      reader.onloadend = () => {
        setFormData(prev => ({ ...prev, image: reader.result }));
      };
      reader.readAsDataURL(file);
    }
  };

  const calculateMatchScore = (candidate, target) => {
    let score = 0;
    if (candidate.gender === target.gender) return 0;
    
    const minAge = target.lookingFor?.minAge || 18;
    const maxAge = target.lookingFor?.maxAge || 99;
    
    // Age Match
    if (candidate.age >= minAge && candidate.age <= maxAge) {
      score += 40;
    } else {
      const diff = Math.min(Math.abs(candidate.age - minAge), Math.abs(candidate.age - maxAge));
      score += Math.max(0, 30 - (diff * 5));
    }

    // Religious Match
    if (candidate.religiousLevel === target.lookingFor?.religiousLevel) {
      score += 30;
    } else if (candidate.religiousLevel && target.lookingFor?.religiousLevel && 
               (candidate.religiousLevel.includes(target.lookingFor.religiousLevel) || 
                target.lookingFor.religiousLevel.includes(candidate.religiousLevel))) {
      score += 15;
    }

    // Height Preference Logic
    if (target.gender === 'female') {
      if (candidate.height >= target.height) score += 10;
    } else {
      if (candidate.height <= target.height + 10) score += 10;
    }
    
    return Math.min(100, score + 20); // Base score boost
  };

  const filteredProfiles = useMemo(() => {
    return profiles.filter(p => {
      const fullName = `${p.firstName} ${p.lastName}`;
      const matchesSearch = fullName.includes(searchTerm) || p.origin?.includes(searchTerm) || p.livingToday?.includes(searchTerm);
      const matchesGender = filterGender === 'all' || p.gender === filterGender;
      return matchesSearch && matchesGender;
    });
  }, [profiles, searchTerm, filterGender]);

  const matchesForSelected = useMemo(() => {
    if (!selectedProfileForMatch) return [];
    return profiles
      .map(p => ({ ...p, score: calculateMatchScore(p, selectedProfileForMatch) }))
      .filter(p => p.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [selectedProfileForMatch, profiles]);


  // --- רינדור ראשי ---

  if (!firebaseConfig) {
    return <SetupScreen onSave={setFirebaseConfig} />;
  }

  if (authError === 'AUTH_DISABLED' || authError === 'INVALID_KEY' || authError === 'INIT_FAILED') {
    return (
        <div dir="rtl" className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
            <div className="bg-white p-8 rounded-2xl shadow-lg max-w-lg w-full">
                <div className="text-center mb-6">
                    <div className="bg-red-100 w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4">
                        <AlertTriangle className="w-8 h-8 text-red-600" />
                    </div>
                    <h2 className="text-2xl font-bold text-gray-900">שגיאת התחברות ל-Firebase</h2>
                </div>
                {/* ... (Error messages same as before) ... */}
                <button 
                  onClick={handleResetConfig}
                  className="w-full mt-6 py-3 bg-gray-900 text-white font-bold rounded-xl hover:bg-gray-800 transition-colors"
                >
                  אפס הגדרות ונסה שוב
                </button>
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
            <div className="flex items-center gap-3 group cursor-pointer" onClick={() => setActiveTab('database')}>
              <div className="relative">
                <Heart className="text-rose-500 w-9 h-9 drop-shadow-lg group-hover:scale-110 transition-transform" fill="currentColor" />
                <Sparkles className="absolute -top-1 -right-1 w-4 h-4 text-yellow-400 animate-pulse" />
              </div>
              <div>
                <h1 className="text-2xl font-extrabold bg-clip-text text-transparent bg-gradient-to-r from-rose-500 to-purple-600 leading-none">שדכן אקספרס</h1>
                <p className="text-xs text-indigo-600 font-bold flex items-center gap-1 mt-1">
                  <Cloud className="w-3 h-3" /> מחובר לענן המשפחתי
                </p>
              </div>
            </div>
            
            <div className="flex gap-3 w-full md:w-auto overflow-x-auto pb-2 md:pb-0 scrollbar-hide">
               <div className="flex bg-gray-100/80 p-1.5 rounded-xl ml-2 shadow-inner">
                <button onClick={() => {resetForm(); setActiveTab('database');}} 
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'database' ? 'bg-white shadow text-blue-600 scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Users className="w-4 h-4" /> המאגר
                </button>
                <button onClick={() => setActiveTab('add')} 
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'add' ? 'bg-white shadow text-indigo-600 scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
                  {editingId ? <><Edit className="w-4 h-4" /> עריכה</> : <><UserPlus className="w-4 h-4" /> הוספה</>}
                </button>
                <button onClick={() => setActiveTab('match')} 
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-2 ${activeTab === 'match' ? 'bg-white shadow text-rose-600 scale-105' : 'text-gray-500 hover:text-gray-700'}`}>
                  <Sparkles className="w-4 h-4" /> התאמות
                </button>
              </div>
              
              <button onClick={handleResetConfig} className="p-2.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors" title="הגדרות חיבור">
                <Settings className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {loading && (
          <div className="fixed inset-0 bg-white/50 backdrop-blur-sm z-50 flex items-center justify-center">
             <div className="bg-white p-6 rounded-2xl shadow-xl flex flex-col items-center">
                <Loader className="w-10 h-10 animate-spin text-indigo-600 mb-2" />
                <span className="text-sm font-bold text-gray-600">מעדכן נתונים...</span>
             </div>
          </div>
        )}

        {/* --- VIEW: DATABASE --- */}
        {activeTab === 'database' && (
          <div className="space-y-8 animate-in fade-in duration-500">
            {/* Filter Bar */}
            <div className="bg-white/80 backdrop-blur p-5 rounded-2xl shadow-sm border border-indigo-50 flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[240px]">
                <label className="text-xs font-bold text-indigo-900 mb-2 block">חיפוש מהיר</label>
                <div className="relative group">
                  <Search className="absolute right-3 top-3 w-5 h-5 text-indigo-300 group-focus-within:text-indigo-600 transition-colors" />
                  <input 
                    type="text" 
                    placeholder="חפש שם, מקום, תכונה..." 
                    className="w-full pl-4 pr-10 py-2.5 border-2 border-indigo-50 rounded-xl focus:border-indigo-400 focus:ring-0 focus:outline-none bg-indigo-50/30 transition-all"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>
              <div className="w-48">
                <label className="text-xs font-bold text-indigo-900 mb-2 block">סינון</label>
                <select className="w-full p-2.5 border-2 border-indigo-50 rounded-xl focus:border-indigo-400 outline-none bg-white" value={filterGender} onChange={(e) => setFilterGender(e.target.value)}>
                  <option value="all">כל המועמדים</option>
                  <option value="male">רק בחורים</option>
                  <option value="female">רק בחורות</option>
                </select>
              </div>
            </div>

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {filteredProfiles.map(profile => (
                <div key={profile.id} className="group bg-white rounded-2xl shadow-sm border border-white hover:border-indigo-200 hover:shadow-xl hover:-translate-y-1 transition-all duration-300 flex flex-col overflow-hidden">
                  
                  {/* Card Header Image */}
                  <div className="relative h-48 overflow-hidden bg-gray-100">
                     {profile.image ? (
                       <img src={profile.image} alt={profile.firstName} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" />
                     ) : (
                       <div className={`w-full h-full flex items-center justify-center bg-gradient-to-br ${profile.gender === 'male' ? 'from-cyan-50 to-blue-100' : 'from-rose-50 to-pink-100'}`}>
                         <Users className={`w-12 h-12 ${profile.gender === 'male' ? 'text-blue-300' : 'text-rose-300'}`} />
                       </div>
                     )}
                     
                     <div className="absolute top-0 w-full p-3 flex justify-between items-start bg-gradient-to-b from-black/30 to-transparent">
                        <span className={`px-2.5 py-1 rounded-lg text-xs font-bold text-white shadow-sm backdrop-blur-md ${profile.gender === 'male' ? 'bg-cyan-500/90' : 'bg-rose-500/90'}`}>
                           {profile.age}
                        </span>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <button onClick={(e) => { e.stopPropagation(); startEditing(profile); }} className="p-1.5 bg-white/90 rounded-full text-indigo-600 hover:bg-white hover:text-indigo-800 shadow-sm" title="ערוך">
                                <Edit className="w-4 h-4" />
                            </button>
                            <button onClick={(e) => { e.stopPropagation(); deleteProfile(profile.id); }} className="p-1.5 bg-white/90 rounded-full text-red-500 hover:bg-white hover:text-red-700 shadow-sm" title="מחק">
                                <Trash2 className="w-4 h-4" />
                            </button>
                        </div>
                     </div>
                  </div>

                  {/* Card Content */}
                  <div className="p-5 flex-1 flex flex-col">
                    <div className="mb-3">
                      <h3 className="text-xl font-bold text-gray-800 group-hover:text-indigo-700 transition-colors">{profile.firstName} {profile.lastName}</h3>
                      <div className="flex flex-wrap gap-2 mt-2">
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md border border-gray-200">{profile.religiousLevel}</span>
                        <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-md border border-gray-200">{profile.lifeStage}</span>
                      </div>
                    </div>
                    
                    <div className="text-sm text-gray-600 space-y-2 mb-4">
                      <div className="flex items-center gap-2">
                         <MapPin className="w-4 h-4 text-indigo-400" />
                         <span className="truncate">{profile.livingToday}</span>
                      </div>
                      <div className="flex items-center gap-2">
                         <Briefcase className="w-4 h-4 text-indigo-400" />
                         <span className="truncate">{profile.currentOccupation}</span>
                      </div>
                    </div>
                    
                    {expandedProfileId === profile.id && (
                      <div className="bg-indigo-50/50 -mx-5 px-5 py-4 mb-4 border-y border-indigo-100 text-sm space-y-3 animate-in slide-in-from-top-2">
                         <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-white p-2 rounded border border-indigo-100"><span className="font-bold block text-indigo-900">גובה</span> {profile.height} ס"מ</div>
                            <div className="bg-white p-2 rounded border border-indigo-100"><span className="font-bold block text-indigo-900">מראה</span> {profile.appearance}</div>
                         </div>
                         <div><span className="font-bold text-indigo-900">עיסוקי עבר:</span> {profile.pastOccupations}</div>
                         <div><span className="font-bold text-indigo-900">תכונות:</span> {profile.characterTraits}</div>
                         <div className="italic text-gray-600">"{profile.aboutMe}"</div>
                         <div className="border-t border-indigo-200 pt-2 mt-2">
                            <span className="font-bold text-indigo-900 block mb-1">מחפש/ת:</span> 
                            <span className="text-xs bg-rose-50 text-rose-800 px-2 py-1 rounded block">{profile.lookingForText}</span>
                         </div>
                         <div><span className="font-bold text-indigo-900">לימודים:</span> {profile.highSchool}, {profile.postHighSchool}</div>
                         <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-sm mt-2 flex items-center justify-between">
                           <div>
                                <span className="font-bold block text-indigo-900 text-xs uppercase">איש קשר</span>
                                <span className="font-medium">{profile.contactName}</span>
                           </div>
                         </div>
                      </div>
                    )}

                    <div className="mt-auto pt-2 space-y-3">
                      <button 
                         onClick={() => setExpandedProfileId(expandedProfileId === profile.id ? null : profile.id)}
                         className="w-full text-xs font-bold text-gray-400 hover:text-indigo-600 flex items-center justify-center gap-1 py-1 transition-colors uppercase tracking-wide"
                      >
                        {expandedProfileId === profile.id ? (
                          <>סגור פרטים <ChevronUp className="w-3 h-3" /></>
                        ) : (
                          <>פרטים מלאים <ChevronDown className="w-3 h-3" /></>
                        )}
                      </button>
                      
                      <button 
                        onClick={() => {
                          setSelectedProfileForMatch(profile);
                          setActiveTab('match');
                        }}
                        className="w-full bg-gray-900 text-white text-sm font-bold py-2.5 px-3 rounded-xl hover:bg-indigo-600 hover:shadow-lg hover:shadow-indigo-200 transition-all flex justify-center items-center gap-2 group/btn"
                      >
                        <Sparkles className="w-4 h-4 text-yellow-300 group-hover/btn:animate-spin" />
                        מצא שידוך
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              
              {/* Empty State */}
              {filteredProfiles.length === 0 && !loading && (
                 <div className="col-span-full py-20 text-center">
                    <div className="bg-white inline-block p-6 rounded-full shadow-sm mb-4">
                        <Search className="w-12 h-12 text-gray-300" />
                    </div>
                    <h3 className="text-xl font-bold text-gray-900">לא נמצאו תוצאות</h3>
                    <p className="text-gray-500">נסה לשנות את הסינון או הוסף כרטיס חדש</p>
                    <button onClick={() => setActiveTab('add')} className="mt-6 text-indigo-600 font-bold hover:underline">הוסף כרטיס ראשון</button>
                 </div>
              )}
            </div>
          </div>
        )}

        {/* --- VIEW: ADD/EDIT PROFILE --- */}
        {activeTab === 'add' && (
          <div className="max-w-4xl mx-auto animate-in fade-in slide-in-from-bottom-4">
            <form onSubmit={handleSaveProfile} className="bg-white/90 backdrop-blur p-8 rounded-3xl shadow-xl border border-white space-y-8 relative">
              
              {editingId && (
                <button type="button" onClick={() => {resetForm(); setActiveTab('database')}} className="absolute top-6 left-6 p-2 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors">
                    <X className="w-5 h-5 text-gray-600" />
                </button>
              )}

              <div className="text-center mb-8 border-b border-gray-100 pb-6">
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4 shadow-lg rotate-3 ${editingId ? 'bg-indigo-600' : 'bg-green-500'}`}>
                    {editingId ? <Edit className="w-8 h-8 text-white" /> : <UserPlus className="w-8 h-8 text-white" />}
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900">{editingId ? 'עריכת כרטיס קיים' : 'יצירת כרטיס חדש'}</h2>
                <p className="text-gray-500 mt-2">
                    {editingId ? 'עדכן את הפרטים ולחץ על שמירה' : 'הכרטיס יופיע מיד אצל כל מי שמחובר לחשבון'}
                </p>
              </div>

              {/* 1. Basic Info */}
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
                   <div><label className="label">שם פרטי *</label><input required name="firstName" value={formData.firstName} onChange={handleInputChange} className="input-field" placeholder="לדוגמה: יונתן" /></div>
                   <div><label className="label">שם משפחה *</label><input required name="lastName" value={formData.lastName} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">גיל</label><input type="number" name="age" value={formData.age} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">מראה חיצוני (צבע עור/שיער/עיניים)</label><input name="appearance" value={formData.appearance} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">גובה (ס"מ)</label><input type="number" name="height" value={formData.height} onChange={handleInputChange} className="input-field" /></div>
                   <div><label className="label">רמה דתית</label><input name="religiousLevel" value={formData.religiousLevel} onChange={handleInputChange} className="input-field" placeholder="לדוגמה: דתי לאומי תורני" /></div>
                 </div>
              </div>

              {/* 2. Occupation & Status */}
              <div className="section-container">
                 <h3 className="section-title"><Briefcase className="w-5 h-5 text-indigo-600" /> עיסוק ושלב בחיים</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div><label className="label">עיסוק נוכחי</label><input name="currentOccupation" value={formData.currentOccupation} onChange={handleInputChange} className="input-field" /></div>
                    <div><label className="label">עיסוקים בעבר / צבא</label><input name="pastOccupations" value={formData.pastOccupations} onChange={handleInputChange} className="input-field" /></div>
                    <div className="md:col-span-2"><label className="label">שלב בחיים (סטודנט / עובד / משלב...)</label><input name="lifeStage" value={formData.lifeStage} onChange={handleInputChange} className="input-field" /></div>
                 </div>
              </div>

              {/* 3. Education & Location */}
              <div className="section-container">
                 <h3 className="section-title"><GraduationCap className="w-5 h-5 text-indigo-600" /> לימודים ומגורים</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                    <div><label className="label">מאיפה במקור</label><input name="origin" value={formData.origin} onChange={handleInputChange} className="input-field" /></div>
                    <div><label className="label">גר היום</label><input name="livingToday" value={formData.livingToday} onChange={handleInputChange} className="input-field" /></div>
                    <div>
                      <label className="label">איפה למד בתיכון</label>
                      <input list="highschools" name="highSchool" value={formData.highSchool} onChange={handleInputChange} className="input-field" placeholder="בחר או הקלד..." />
                      <datalist id="highschools">{HIGH_SCHOOL_OPTIONS.map(opt => <option key={opt} value={opt} />)}</datalist>
                    </div>
                    <div>
                      <label className="label">לימודים אחרי גיל 18</label>
                      <input list="postHighSchools" name="postHighSchool" value={formData.postHighSchool} onChange={handleInputChange} className="input-field" placeholder="בחר או הקלד..." />
                      <datalist id="postHighSchools">{POST_HIGH_SCHOOL_OPTIONS.map(opt => <option key={opt} value={opt} />)}</datalist>
                    </div>
                 </div>
              </div>

              {/* 4. Personality & Details */}
              <div className="section-container">
                 <h3 className="section-title"><Smile className="w-5 h-5 text-indigo-600" /> אישיות</h3>
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                   <div className="md:col-span-2"><label className="label">כמה מילים על עצמי</label><textarea name="aboutMe" rows="2" value={formData.aboutMe} onChange={handleInputChange} className="input-field" /></div>
                   <div className="md:col-span-2"><label className="label">תחומי עניין / תחביבים</label><input name="interests" value={formData.interests} onChange={handleInputChange} className="input-field" /></div>
                   <div className="md:col-span-2"><label className="label">תכונות אופי בולטות</label><input name="characterTraits" value={formData.characterTraits} onChange={handleInputChange} className="input-field" /></div>
                   <div className="md:col-span-2">
                     <label className="label">משפט מנחה / מוטו</label>
                     <div className="relative"><Quote className="absolute top-3 right-3 w-4 h-4 text-gray-400" /><input name="motto" value={formData.motto} onChange={handleInputChange} className="input-field pr-10 bg-indigo-50/30" /></div>
                   </div>
                 </div>
              </div>

              {/* 5. Match Criteria */}
              <div className="section-container bg-gradient-to-r from-rose-50 to-pink-50 border-rose-100">
                 <h3 className="section-title text-rose-800"><Heart className="w-5 h-5 text-rose-500" /> מה אני מחפש/ת?</h3>
                 <div className="grid grid-cols-1 gap-4">
                   <div><label className="label text-rose-900">תיאור חופשי של בן/בת הזוג</label><textarea name="lookingForText" rows="3" value={formData.lookingForText} onChange={handleInputChange} className="input-field border-rose-200 focus:border-rose-400 focus:ring-rose-200" placeholder="חשוב לי ש..." /></div>
                   <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-2">
                      <div><label className="text-xs font-bold text-rose-700 mb-1 block">גיל מינימלי</label><input type="number" name="lookingForMinAge" value={formData.lookingForMinAge} onChange={handleInputChange} className="p-2 border border-rose-200 rounded-lg w-full text-sm focus:outline-none focus:border-rose-400" /></div>
                      <div><label className="text-xs font-bold text-rose-700 mb-1 block">גיל מקסימלי</label><input type="number" name="lookingForMaxAge" value={formData.lookingForMaxAge} onChange={handleInputChange} className="p-2 border border-rose-200 rounded-lg w-full text-sm focus:outline-none focus:border-rose-400" /></div>
                      <div><label className="text-xs font-bold text-rose-700 mb-1 block">רמה דתית מועדפת</label><input name="lookingForReligiousLevel" value={formData.lookingForReligiousLevel} onChange={handleInputChange} className="p-2 border border-rose-200 rounded-lg w-full text-sm focus:outline-none focus:border-rose-400" /></div>
                   </div>
                 </div>
              </div>

              {/* 6. Contact & Image */}
              <div className="section-container">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div><label className="label">איש קשר (שם וטלפון)</label><input name="contactName" value={formData.contactName} onChange={handleInputChange} className="input-field font-bold bg-yellow-50 border-yellow-200" /></div>
                    <div>
                       <label className="label">תמונת פרופיל</label>
                       <div className="flex items-center gap-4">
                         <label className="flex-1 cursor-pointer bg-white hover:bg-gray-50 text-gray-600 transition-all py-2.5 px-4 rounded-xl border border-dashed border-gray-400 flex items-center justify-center gap-2 hover:border-indigo-400 hover:text-indigo-600">
                           <Camera className="w-5 h-5" />
                           <span>{editingId ? 'החלף תמונה' : 'בחר תמונה...'}</span>
                           <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                         </label>
                         {formData.image && <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-green-500 shadow-sm"><img src={formData.image} className="w-full h-full object-cover" /></div>}
                       </div>
                    </div>
                 </div>
              </div>

              <div className="flex gap-4 pt-4">
                  {editingId && (
                      <button type="button" onClick={() => {resetForm(); setActiveTab('database');}} className="flex-1 py-4 bg-gray-100 text-gray-700 font-bold rounded-xl hover:bg-gray-200 transition-colors">
                        ביטול
                      </button>
                  )}
                  <button type="submit" disabled={loading} className={`flex-[2] py-4 text-white font-bold rounded-xl shadow-lg flex items-center justify-center gap-2 text-lg hover:shadow-xl hover:scale-[1.01] transition-all ${editingId ? 'bg-indigo-600 hover:bg-indigo-700' : 'bg-gray-900 hover:bg-black'}`}>
                    <Save className="w-6 h-6" />
                    {loading ? 'שומר...' : (editingId ? 'עדכן כרטיס' : 'שמור כרטיס בענן')}
                  </button>
              </div>
            </form>
          </div>
        )}

        {/* --- VIEW: MATCHMAKER --- */}
        {activeTab === 'match' && (
          <div className="h-full animate-in fade-in zoom-in-95 duration-300">
            {!selectedProfileForMatch ? (
              <div className="text-center py-20 bg-white/90 backdrop-blur rounded-3xl shadow-xl border border-white max-w-2xl mx-auto">
                <div className="bg-rose-100 w-24 h-24 rounded-full flex items-center justify-center mx-auto mb-8 animate-bounce-slow">
                  <Heart className="w-12 h-12 text-rose-500" fill="currentColor" />
                </div>
                <h2 className="text-3xl font-extrabold text-gray-900 mb-4">מערכת השידוכים החכמה</h2>
                <p className="text-gray-500 mb-8 max-w-md mx-auto text-lg">בחר פרופיל מתוך המאגר כדי לראות שידוכים פוטנציאליים מבוססי אלגוריתם.</p>
                <button onClick={() => setActiveTab('database')} className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-8 py-4 rounded-2xl font-bold hover:shadow-lg hover:shadow-blue-200 transition-all transform hover:-translate-y-1">
                  חזור למאגר לבחירה
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                {/* Sidebar - Selected Profile */}
                <div className="lg:col-span-1">
                  <div className="bg-white rounded-2xl shadow-lg border border-indigo-50 sticky top-28 overflow-hidden">
                    <div className="h-24 bg-gradient-to-r from-indigo-500 to-purple-500"></div>
                    <div className="px-6 relative">
                         <div className="w-24 h-24 rounded-full border-4 border-white shadow-md bg-gray-200 -mt-12 overflow-hidden mx-auto">
                            {selectedProfileForMatch.image ? (
                            <img src={selectedProfileForMatch.image} className="w-full h-full object-cover" />
                            ) : (
                            <div className="w-full h-full flex items-center justify-center text-3xl font-bold text-gray-400 bg-gray-100">
                                {selectedProfileForMatch.firstName[0]}
                            </div>
                            )}
                        </div>
                    </div>
                    
                    <div className="p-6 text-center">
                      <h3 className="text-xs font-bold text-indigo-400 uppercase tracking-wider mb-2">מחפשים עבור</h3>
                      <h2 className="text-2xl font-extrabold text-gray-900">{selectedProfileForMatch.firstName}</h2>
                      <p className="text-gray-500 font-medium mb-4">{selectedProfileForMatch.age} • {selectedProfileForMatch.livingToday}</p>
                      
                      <div className="text-right bg-rose-50 p-4 rounded-xl text-sm border border-rose-100">
                         <p className="font-bold text-rose-800 mb-1 flex items-center gap-1"><Heart className="w-3 h-3" fill="currentColor" /> מחפש/ת:</p>
                         <p className="text-gray-700 leading-relaxed">{selectedProfileForMatch.lookingForText}</p>
                      </div>

                      <button onClick={() => setSelectedProfileForMatch(null)} className="w-full mt-6 py-2.5 text-gray-600 hover:bg-gray-50 rounded-xl text-sm font-bold border border-gray-200 transition-colors">
                          בחר מישהו אחר
                      </button>
                    </div>
                  </div>
                </div>

                {/* Main - Matches */}
                <div className="lg:col-span-3 space-y-6">
                  <div className="flex justify-between items-center mb-2 px-2">
                    <h2 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                        <Sparkles className="w-6 h-6 text-yellow-500" />
                        התאמות מוצעות
                    </h2>
                    <span className="bg-indigo-100 text-indigo-800 text-sm font-bold px-3 py-1 rounded-full">{matchesForSelected.length} תוצאות</span>
                  </div>

                  {matchesForSelected.length === 0 ? (
                    <div className="bg-white/80 backdrop-blur p-12 rounded-3xl text-center border-2 border-dashed border-gray-200">
                      <p className="text-gray-500 text-lg">לא נמצאו התאמות מתאימות במאגר כרגע.</p>
                      <button onClick={() => setActiveTab('add')} className="mt-4 text-indigo-600 font-bold hover:underline">הוסף מועמדים חדשים למאגר</button>
                    </div>
                  ) : (
                    <div className="space-y-5">
                      {matchesForSelected.map((match) => (
                        <div key={match.id} className="bg-white p-5 rounded-2xl shadow-sm border border-transparent hover:border-indigo-200 flex flex-col md:flex-row gap-6 items-start hover:shadow-xl hover:-translate-y-1 transition-all duration-300 relative group">
                          {/* Score Badge */}
                          <div className={`absolute -top-3 -left-3 px-4 py-2 rounded-xl text-sm font-black shadow-md rotate-[-5deg] z-10 ${match.score >= 80 ? 'bg-gradient-to-r from-green-400 to-emerald-500 text-white' : 'bg-white text-gray-600 border border-gray-200'}`}>
                            {Math.round(match.score)}% התאמה
                          </div>
                          
                          <div className="w-24 h-24 rounded-2xl bg-gray-100 flex-shrink-0 overflow-hidden mt-2 border-2 border-white shadow-md">
                             {match.image ? <img src={match.image} className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center text-gray-300"><Users className="w-8 h-8" /></div>}
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-col md:flex-row md:items-center gap-2 mb-2">
                              <h3 className="text-xl font-bold text-gray-900 truncate">{match.firstName} {match.lastName}</h3>
                              <span className="text-xs font-bold bg-indigo-50 text-indigo-700 px-2 py-1 rounded-md">{match.religiousLevel}</span>
                            </div>
                            <div className="text-sm font-medium text-gray-500 mb-3 flex flex-wrap gap-3">
                                <span>{match.age}</span>
                                <span className="w-1 h-1 bg-gray-300 rounded-full self-center"></span>
                                <span>{match.livingToday}</span>
                                <span className="w-1 h-1 bg-gray-300 rounded-full self-center"></span>
                                <span>{match.currentOccupation}</span>
                            </div>
                            <p className="text-sm text-gray-600 bg-gray-50 p-3 rounded-xl italic border border-gray-100">"{match.aboutMe}"</p>
                          </div>
                          
                          <div className="w-full md:w-auto flex flex-col gap-2 min-w-[160px] self-center bg-blue-50/50 p-3 rounded-xl border border-blue-100">
                               <div className="text-xs text-blue-800 font-bold mb-1 uppercase tracking-wider">לפרטים (איש קשר)</div>
                               <div className="text-sm font-bold text-gray-900">{match.contactName}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      
      <style>{`
        .input-field { 
            width: 100%; 
            padding: 0.75rem 1rem; 
            border: 1px solid #e5e7eb; 
            border-radius: 0.75rem; 
            outline: none; 
            background-color: #f9fafb;
            transition: all 0.2s;
        }
        .input-field:focus { 
            background-color: #fff;
            border-color: #6366f1; 
            box-shadow: 0 0 0 3px rgba(99, 102, 241, 0.1); 
        }
        .label { 
            display: block; 
            font-size: 0.875rem; 
            font-weight: 700; 
            color: #4b5563; 
            margin-bottom: 0.35rem; 
        }
        .section-container {
            border-top: 1px solid #f3f4f6;
            padding-top: 1.5rem;
        }
        .section-title { 
            font-size: 1.125rem; 
            font-weight: 800; 
            color: #1f2937; 
            margin-bottom: 1rem; 
            display: flex; 
            align-items: center; 
            gap: 0.5rem; 
        }
        .scrollbar-hide::-webkit-scrollbar {
            display: none;
        }
        .scrollbar-hide {
            -ms-overflow-style: none;
            scrollbar-width: none;
        }
      `}</style>
    </div>
  );
}