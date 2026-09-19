import { useState } from "react";
import { useNavigate } from "react-router";
import { useMutation, useQuery } from "convex/react";
import { toast } from "sonner";
import { api } from "@/convex/_generated/api";
import { useAuth } from "@/hooks/use-auth";
import logo from "@/assets/logo.svg";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, LogOut, Users } from "lucide-react";
import { cn } from "@/lib/utils";

const SEAT_OPTIONS = [6, 8, 12] as const;

export default function Dashboard() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const createGame = useMutation(api.games.createGame);
  const joinGame = useMutation(api.games.joinGame);
  const leaveRoom = useMutation(api.games.leaveRoom);
  const membership = useQuery(api.games.myMembership);
  const recent = useQuery(api.games.myRecentRooms);

  const [seats, setSeats] = useState<number>(6);
  const [teamMode, setTeamMode] = useState(true);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  const create = async () => {
    setBusy(true);
    try {
      const res = await createGame({ seats, teamMode });
      navigate(`/room/${res.gameCode}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create room.");
    } finally {
      setBusy(false);
    }
  };

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    try {
      const res = await joinGame({ code: code.trim() });
      navigate(`/room/${res.gameCode}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not join room.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-6">
        <button
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
          onClick={() => navigate("/")}
        >
          <ArrowLeft className="size-4" />
          <img src={logo} alt="" className="size-6 rounded-md" />
          <span className="font-medium text-foreground">Parlor</span>
        </button>
        <Button variant="ghost" size="sm" onClick={handleSignOut} className="text-muted-foreground">
          <LogOut className="size-4" />
          Sign out
        </Button>
      </header>

      <div className="mx-auto w-full max-w-5xl px-6 pb-20">
        <div className="pt-8">
          <p className="text-xs uppercase tracking-[0.3em] text-muted-foreground">Your table</p>
          <h1 className="mt-3 text-4xl font-medium tracking-tight">
            {user?.name ? `Hello, ${user.name}` : "Hello"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Start a room or rejoin friends with a code.
          </p>
        </div>

        {membership && (
          <div className="mt-8 flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
            <span>
              You have an active room — <span className="font-mono font-medium">{membership.gameCode}</span>
            </span>
            <div className="flex items-center gap-2">
              <Button size="sm" onClick={() => navigate(`/room/${membership.gameCode}`)}>
                Rejoin
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="text-muted-foreground"
                onClick={async () => {
                  await leaveRoom();
                  toast.success("Left the room.");
                }}
              >
                Leave
              </Button>
            </div>
          </div>
        )}

        <div className="mt-10 grid gap-10 lg:grid-cols-2">
          {/* Create */}
          <section>
            <h2 className="text-sm font-medium">Create a room</h2>
            <div className="mt-4 border-t border-border/60 pt-6">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">Seats</p>
              <div className="mt-3 flex gap-2">
                {SEAT_OPTIONS.map((n) => (
                  <button
                    key={n}
                    onClick={() => setSeats(n)}
                    className={cn(
                      "h-12 flex-1 rounded-lg border text-sm transition-colors",
                      seats === n
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    {n} players
                  </button>
                ))}
              </div>

              <p className="mt-6 text-xs uppercase tracking-wider text-muted-foreground">Mode</p>
              <div className="mt-3 flex gap-2">
                {[
                  { label: "Teams", value: true, hint: "Adjacent seats pair up" },
                  { label: "Solo", value: false, hint: "Every seat for itself" },
                ].map((m) => (
                  <button
                    key={m.label}
                    onClick={() => setTeamMode(m.value)}
                    className={cn(
                      "h-12 flex-1 rounded-lg border px-3 text-left transition-colors",
                      teamMode === m.value
                        ? "border-foreground bg-foreground text-background"
                        : "border-border text-muted-foreground hover:border-foreground/40 hover:text-foreground",
                    )}
                  >
                    <span className="block text-sm font-medium">{m.label}</span>
                    <span className="block text-[11px] opacity-70">{m.hint}</span>
                  </button>
                ))}
              </div>

              <Button className="mt-8 w-full rounded-full" size="lg" onClick={create} disabled={busy}>
                {busy ? "Opening…" : `Open ${seats}-seat room`}
              </Button>
            </div>
          </section>

          {/* Join */}
          <section>
            <h2 className="text-sm font-medium">Join with a code</h2>
            <div className="mt-4 border-t border-border/60 pt-6">
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="ABC12"
                maxLength={5}
                className="h-12 rounded-lg text-center font-mono text-lg tracking-[0.4em]"
                onKeyDown={(e) => e.key === "Enter" && join()}
              />
              <Button
                className="mt-4 w-full rounded-full"
                size="lg"
                variant="outline"
                onClick={join}
                disabled={busy || code.trim().length < 4}
              >
                <Users className="size-4" />
                Join room
              </Button>

              {recent && recent.length > 0 && (
                <>
                  <Separator className="my-8" />
                  <p className="text-xs uppercase tracking-wider text-muted-foreground">Recent rooms</p>
                  <ul className="mt-3 divide-y divide-border/60">
                    {recent.map((r) => (
                      <li key={r.code} className="flex items-center justify-between py-3 text-sm">
                        <div>
                          <span className="font-mono font-medium">{r.code}</span>
                          <span className="ml-3 text-muted-foreground">
                            {r.seats} seats · {r.teamMode ? "teams" : "solo"} · {r.memberCount} in room
                          </span>
                        </div>
                        {r.status !== "finished" ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => navigate(`/room/${r.code}`)}
                          >
                            Open
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">Ended</span>
                        )}
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
