import Image from "next/image";
import { signIn } from "./actions";

type LoginPageProps = {
  searchParams: Promise<{
    error?: string;
    success?: string;
  }>;
};

export default async function LoginPage({
  searchParams,
}: LoginPageProps) {
  const { error, success } = await searchParams;

  return (
    <main className="relative isolate flex min-h-[calc(100dvh-var(--apex-header-height,112px))] items-center justify-center px-5 py-5 text-[#102448]">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      >
        <Image
          src="/images/apex-solar-hero.png"
          alt=""
          fill
          priority
          sizes="100vw"
          className="object-cover object-[70%_center]"
        />

        <div className="absolute inset-0 bg-[#f5f7fb]/90" />
      </div>

      <div className="w-full max-w-lg">
        <div className="mb-5 text-center">
          <div className="mx-auto mb-3 w-30">
            <Image
              src="/images/apex-logo-mark.png"
              alt="APEX Panelboard and Electrical Fabrication Corp."
              width={1440}
              height={1120}
              priority
              sizes="120px"
              className="h-auto w-full object-contain"
            />
          </div>

          <p className="mb-3 text-sm font-bold uppercase tracking-[0.3em] text-[#8a6309]">
            APEX Business
          </p>

          <h1 className="text-4xl font-semibold tracking-tight text-[#082451]">
            Welcome back
          </h1>

          <p className="mt-3 text-lg text-[#52647d]">
            Sign in to your private business dashboard.
          </p>
        </div>

        <form
          action={signIn}
          className="space-y-4 rounded-3xl border border-[#dce4ef] bg-white/95 p-5 shadow-[0_20px_70px_rgba(8,36,81,0.12)] backdrop-blur-sm sm:p-6"
        >
          <div>
            <label
              htmlFor="email"
              className="mb-2 block text-lg font-semibold text-[#082451]"
            >
              Email address
            </label>

            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              required
              className="w-full rounded-xl border border-[#dce4ef] bg-[#f5f7fb] px-4 py-3.5 text-lg text-[#102448] placeholder:text-[#52647d] focus:border-[#b98208]"
              placeholder="name@apex.com"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="mb-2 block text-lg font-semibold text-[#082451]"
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              className="w-full rounded-xl border border-[#dce4ef] bg-[#f5f7fb] px-4 py-3.5 text-lg text-[#102448] placeholder:text-[#52647d] focus:border-[#b98208]"
              placeholder="Enter your password"
            />
          </div>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-base text-red-700"
            >
              {error}
            </p>
          )}

          {!error && success === "logged-out" && (
            <p
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-base text-emerald-800"
            >
              You have successfully logged out.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-xl bg-[#f2b72f] px-4 py-3.5 text-lg font-bold text-[#082451] transition hover:bg-[#e5a91e]"
          >
            Sign in
          </button>
        </form>

        <p className="mt-4 text-center text-base text-[#52647d]">
          Authorized APEX personnel only
        </p>
      </div>
    </main>
  );
}