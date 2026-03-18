"use client";

import { useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Cookies from "js-cookie";
import { Suspense } from "react";

function CallbackContent() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const token = searchParams.get("token");
    const slug = searchParams.get("slug");

    if (token && slug) {
      Cookies.set("token", token, { expires: 7 });
      Cookies.set("ingressSlug", slug, { expires: 7 });
      router.push("/dashboard");
    } else {
      router.push("/login");
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-primary">
      <p className="text-text-secondary">Signing you in...</p>
    </div>
  );
}

export default function AuthCallbackPage() {
  return (
    <Suspense>
      <CallbackContent />
    </Suspense>
  );
}
