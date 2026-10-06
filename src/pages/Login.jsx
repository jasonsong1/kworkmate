import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Hash, LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { safeReturnTo } from "@/lib/authReturnTo";
import { cn } from "@/lib/utils";

export default function Login() {
  // The employer hands out an employee number, but the platform signs in with the work address
  // on the account, which is what the number resolves to before the password is checked.
  const [mode, setMode] = useState("email");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  // Post-login destination (e.g. the MCP OAuth consent page sends users here
  // with returnTo so the grant flow can resume). Same-origin paths only.
  const returnTo = safeReturnTo();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      let address = email.trim();
      if (mode === "number") {
        const response = await base44.functions.invoke("resolveEmployeeLogin", {
          employee_number: address,
        });
        if (response.data?.error) throw new Error(response.data.error);
        address = response.data.email;
      }
      await base44.auth.loginViaEmailPassword(address, password);
      window.location.href = returnTo;
    } catch (err) {
      setError(err.message || "Invalid email or password");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome to K-workmate"
      subtitle="Log in with your work account"
      footer="Accounts are created by your employer. Ask your manager if you need access."
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
            onClick={() => { setMode("email"); setEmail(""); setError(""); }}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "email" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Work email
          </button>
          <button
            type="button"
            onClick={() => { setMode("number"); setEmail(""); setError(""); }}
            className={cn(
              "rounded-md px-3 py-2 text-sm font-medium transition-colors",
              mode === "number" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            )}
          >
            Employee number
          </button>
        </div>
        <div className="space-y-2">
          <Label htmlFor="identifier">{mode === "email" ? "Email" : "Employee number"}</Label>
          <div className="relative">
            {mode === "email" ? (
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            ) : (
              <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            )}
            <Input
              id="identifier"
              type={mode === "email" ? "email" : "text"}
              autoComplete={mode === "email" ? "email" : "username"}
              autoFocus
              placeholder={mode === "email" ? "you@example.com" : "BRN-001"}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required
            />
          </div>
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-xs text-primary hover:underline">
              Forgot password?
            </Link>
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