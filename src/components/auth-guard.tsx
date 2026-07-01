"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ApiUser, api } from "@/lib/client";

export function useMe() {
  const [user, setUser] = useState<ApiUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    api<{ user: ApiUser | null; hasUsers: boolean }>("/api/auth/me")
      .then((data) => {
        if (!data.hasUsers) router.replace("/setup");
        else if (!data.user) router.replace("/login");
        else setUser(data.user);
      })
      .finally(() => setLoading(false));
  }, [router]);

  return { user, loading };
}
