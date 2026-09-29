"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { signOut } from "@/lib/actions";

export default function Home() {
  const { user, profile, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
    } else if (profile) {
      router.replace("/dashboard");
    } else {
      void signOut().finally(() => router.replace("/login?setup=1"));
    }
  }, [user, profile, loading, router]);

  return (
    <div className="flex h-screen items-center justify-center">
      <div className="h-8 w-8 animate-spin rounded-full border-4 border-blue-600 border-t-transparent" />
    </div>
  );
}
