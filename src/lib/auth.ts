import { supabase } from "./supabase";
import type { Session, User } from "@supabase/supabase-js";

export async function getSession(): Promise<Session | null> {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export async function getUser(): Promise<User | null> {
  const { data } = await supabase.auth.getUser();
  return data.user;
}

export async function signUpWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signUp({ email, password });
  return { error: error?.message ?? null };
}

export async function signInWithPassword(email: string, password: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return { error: error?.message ?? null };
}

export async function signInWithGoogle(): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: window.location.origin,
    },
  });
  return { error: error?.message ?? null };
}

export async function signInWithMagicLink(email: string): Promise<{ error: string | null }> {
  const { error } = await supabase.auth.signInWithOtp({ email });
  return { error: error?.message ?? null };
}

export async function signOut(): Promise<void> {
  await supabase.auth.signOut();
}

export async function registerPasskey(): Promise<{ error: string | null }> {
  const user = await getUser();
  if (!user) return { error: "Not authenticated" };

  try {
    const credential = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: "PocketRinggit", id: window.location.hostname },
        user: {
          id: new TextEncoder().encode(user.id),
          name: user.email ?? "user",
          displayName: user.email ?? "PocketRinggit User"
        },
        pubKeyCredParams: [
          { alg: -7, type: "public-key" },
          { alg: -257, type: "public-key" }
        ],
        authenticatorSelection: {
          authenticatorAttachment: "platform",
          userVerification: "required",
          residentKey: "required"
        },
        timeout: 60000
      }
    });

    if (!credential) return { error: "Passkey creation cancelled" };

    const credentialId = btoa(String.fromCharCode(...new Uint8Array((credential as PublicKeyCredential).rawId)));
    await supabase
      .from("user_settings")
      .update({ passkey_credential_id: credentialId })
      .eq("user_id", user.id);

    return { error: null };
  } catch (e) {
    return { error: e instanceof Error ? e.message : "Passkey creation failed" };
  }
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });
  return () => subscription.unsubscribe();
}
