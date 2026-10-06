import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { kwLogin } from "@/lib/kwAuthClient";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { cn } from "@/lib/utils";

export default function Login() {
  // Two doors. An employee signs in with the ID and password their employer issued, and that is
  // checked by this app itself. A manager or admin signs in with their work email, which the
  // platform checks, exactly as before.
  const [door, setDoor] = useState("employee");
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();
  const employeeDoor = door === "employee";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (employeeDoor) {
        await kwLogin(identifier.trim(), password);
        window.location.href = returnTo;
        return;
      }
      await base44.auth.loginViaEmailPassword(identifier.trim(), password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || (employeeDoor ? "Wrong ID or password" : "Invalid email or password"));
    } finally {
      setLoading(false);
    }
  };

  const switchDoor = (next) => {
    setDoor(next);
    setIdentifier("");
    setPassword("");
    setError("");
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome to K-workmate"
      subtitle={employeeDoor ? "Sign in with the ID your employer gave you" : "Sign in with your work email"}
      footer={
        employeeDoor
          ? "Employee IDs and passwords are issued by your employer. Ask your manager if you need one."
          : "Accounts are created by your employer. Ask your manager if you need access."
      }
    >
      {error && (
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => switchDoor("employee")}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              employeeDoor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Employee ID
          </button>
          <button
            type="button"
            onClick={() => switchDoor("work")}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              !employeeDoor ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Work email
          </button>
        </div>

        <div className="space-y-2">
          <Label htmlFor="identifier">{employeeDoor ? "ID or employee number" : "Work email"}</Label>
          <div className="relative">
            {employeeDoor ? (
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            )}
            <Input
              id="identifier"
              type={employeeDoor ? "text" : "email"}
              autoComplete={employeeDoor ? "username" : "email"}
              autoFocus
              placeholder={employeeDoor ? "BRN-001" : "you@example.com"}
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {!employeeDoor && (
              <Link to="/forgot-password" className="text-xs text-primary hover:underline">
                Forgot password?
              </Link>
            )}
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>

        <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </>
          ) : (
            "Log in"
          )}
        </Button>
      </form>
    </AuthLayout>
  );
}