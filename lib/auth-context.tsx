"use client";

import { createContext, useContext, useEffect, useState } from "react";
import { onAuthStateChanged, User } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { UserProfile } from "@/lib/types";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [loadedProfile, setLoadedProfile] = useState<{ uid: string; profile: UserProfile | null } | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setAuthLoading(false);
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      setLoadedProfile({
        uid: user.uid,
        profile: snap.exists()
          ? {
              uid: user.uid,
              shopId: snap.data().shopId ?? "",
              displayName: snap.data().displayName ?? user.displayName ?? "",
              role: snap.data().role ?? "staff",
              permissions: {
                manageCatalog: snap.data().permissions?.manageCatalog === true,
              },
            }
          : null,
      });
    }, () => {
      setLoadedProfile({ uid: user.uid, profile: null });
    });
    return unsub;
  }, [user]);

  const profileReady = user !== null && loadedProfile?.uid === user.uid;
  const profile = profileReady ? loadedProfile.profile : null;
  const loading = authLoading || (user !== null && !profileReady);

  return (
    <AuthContext.Provider value={{ user, profile, loading }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
