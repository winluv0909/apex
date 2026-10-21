"use server";

import { canViewDashboard } from "@/lib/permissions";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function signIn(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect("/login?error=Enter%20your%20email%20and%20password");
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error || !data.user) {
    redirect("/login?error=Invalid%20email%20or%20password");
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", data.user.id)
    .single();

  if (profileError || !profile || !canViewDashboard(profile.role)) {
    await supabase.auth.signOut();

    redirect(
      "/login?error=Access%20is%20limited%20to%20authorized%20APEX%20owners%20and%20viewers",
    );
  }

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

export async function signOut() {
  const supabase = await createClient();
  const { error } = await supabase.auth.signOut();

  if (error) {
    redirect(
      "/login?error=Could%20not%20log%20out.%20Please%20try%20again",
    );
  }

  revalidatePath("/", "layout");
  redirect("/login?success=logged-out");
}