import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import { MoveRight } from "lucide-react";
import { motion } from "framer-motion";
import { Link } from "react-router";

const seatColors = ["#e5646c", "#e8a13c", "#8fbf54", "#4fb8a8", "#5f8fd9", "#9d7fd4"];

export default function Landing() {
  const { isAuthenticated, user } = useAuth();

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Parlor" className="size-7 rounded-md" />
          <span className="text-sm font-medium tracking-tight">Parlor</span>
        </div>
        <nav className="flex items-center gap-6 text-sm">
          <a href="#how" className="hidden text-muted-foreground transition-colors hover:text-foreground sm:block">
            How it works
          </a>
          <Button asChild variant="outline" className="rounded-full">
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              {isAuthenticated ? "Open app" : "Sign in"}
            </Link>
          </Button>
        </nav>
      </header>

      {/* Hero */}
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center px-6 pb-24 pt-16 text-center sm:pt-24">
        <motion.p
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-xs uppercase tracking-[0.3em] text-muted-foreground"
        >
          Ludo, for the whole table
        </motion.p>
        <motion.h1
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="mt-6 max-w-3xl text-balance text-5xl font-medium leading-[1.05] tracking-tight sm:text-7xl"
        >
          Six. Eight. Twelve.
          <span className="block text-muted-foreground">One room. One board.</span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.16 }}
          className="mt-6 max-w-xl text-pretty text-base leading-7 text-muted-foreground"
        >
          A quiet, precise Ludo table for you and your friends — team play for up
          to 12 seats, room and direct-message chat, and voice at the table.
          {user?.name ? ` Welcome back, ${user.name}.` : ""}
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.24 }}
          className="mt-10 flex flex-col items-center gap-3 sm:flex-row"
        >
          <Button asChild size="lg" className="h-11 rounded-full px-8 text-sm">
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              {isAuthenticated ? "Back to your table" : "Create a room"}
              <MoveRight className="ml-2 size-4" />
            </Link>
          </Button>
          <a
            href="#how"
            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
          >
            See how it works
          </a>
        </motion.div>

        {/* Abstract board mark */}
        <motion.div
          initial={{ opacity: 0, scale: 0.97 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.7, delay: 0.3 }}
          className="mt-20 w-full max-w-2xl"
          aria-hidden
        >
          <div className="relative mx-auto aspect-square w-full max-w-[380px]">
            <div className="absolute inset-0 rounded-full border border-border" />
            <div className="absolute inset-8 rounded-full border border-border/70" />
            <div className="absolute inset-16 rounded-full border border-border/40" />
            {seatColors.map((color, i) => {
              const angle = (i / seatColors.length) * Math.PI * 2 - Math.PI / 2;
              const x = 50 + 50 * Math.cos(angle);
              const y = 50 + 50 * Math.sin(angle);
              return (
                <motion.span
                  key={color}
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ delay: 0.5 + i * 0.08, type: "spring", stiffness: 260, damping: 18 }}
                  className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full"
                  style={{ left: `${x}%`, top: `${y}%`, backgroundColor: color }}
                />
              );
            })}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="flex items-center justify-center rounded-full border border-border bg-card px-5 py-3 text-sm tracking-[0.25em] text-muted-foreground">
                6 · 8 · 12
              </div>
            </div>
          </div>
        </motion.div>
      </section>

      {/* How it works */}
      <section id="how" className="border-t border-border/60">
        <div className="mx-auto grid w-full max-w-5xl gap-12 px-6 py-20 sm:grid-cols-3">
          {[
            {
              step: "01",
              title: "Open a room",
              body: "Pick 6, 8 or 12 seats. Share the 5-character code with friends — they join from any browser.",
            },
            {
              step: "02",
              title: "Choose teams",
              body: "Play solo or pair adjacent seats into teams. Teammates share the win and never send each other home.",
            },
            {
              step: "03",
              title: "Talk at the table",
              body: "Room chat, private messages, and one-tap voice. Everything updates live for everyone seated.",
            },
          ].map((item) => (
            <div key={item.step} className="flex flex-col gap-3">
              <span className="text-xs tracking-[0.3em] text-muted-foreground">{item.step}</span>
              <div className="h-px w-8 bg-border" />
              <h3 className="text-lg font-medium tracking-tight">{item.title}</h3>
              <p className="text-sm leading-6 text-muted-foreground">{item.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Footer CTA */}
      <section className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-6 py-24 text-center">
          <h2 className="max-w-lg text-balance text-3xl font-medium tracking-tight sm:text-4xl">
            The table is set. Take a seat.
          </h2>
          <Button asChild size="lg" className="h-11 rounded-full px-8 text-sm">
            <Link to={isAuthenticated ? "/dashboard" : "/auth"}>
              Start a room
              <MoveRight className="ml-2 size-4" />
            </Link>
          </Button>
          <p className="text-xs text-muted-foreground">
            Free · No downloads · Works in the browser
          </p>
        </div>
      </section>

      <footer className="border-t border-border/60">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6 text-xs text-muted-foreground">
          <span>Parlor — Ludo for 6, 8 & 12 players</span>
          <span>Built for friends in one room</span>
        </div>
      </footer>
    </div>
  );
}
