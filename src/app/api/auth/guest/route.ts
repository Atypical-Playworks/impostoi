import { NextResponse } from "next/server";

import { isGuestUser } from "@/lib/auth-policy";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST() {
  const supabase = await createSupabaseServerClient();
  const current = await supabase.auth.getUser();

  if (current.data.user) {
    const session = await supabase.auth.getSession();
    const response = NextResponse.json({ user: current.data.user });
    const accessToken = isGuestUser(current.data.user)
      ? session.data.session?.access_token
      : undefined;
    if (accessToken) {
      response.cookies.set("impostoi_guest_access_token", accessToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      });
    }
    return response;
  }

  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    return NextResponse.json(
      { error: "Unable to start Guest session" },
      { status: 502 },
    );
  }

  const response = NextResponse.json({ user: data.user }, { status: 201 });
  if (data.session?.access_token) {
    response.cookies.set(
      "impostoi_guest_access_token",
      data.session.access_token,
      {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
      },
    );
  }
  return response;
}
