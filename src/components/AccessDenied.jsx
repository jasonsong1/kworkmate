import React from "react";
import { LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Image } from "@/components/ui/image";
import { base44 } from "@/api/base44Client";
import { useI18n } from "@/lib/i18n";

const LOGO_URL =
  "https://media.base44.com/images/public/6abdfea3bcad266c314dcfd3/d5e014129_generated_8d71addc.png";

// Shown to a signed-in account the platform has no company on file for: the employer opens
// accounts and branches, so there is nothing here for them to set up.
export default function AccessDenied() {
  const { t } = useI18n();

  const handleLogout = async () => {
    await base44.auth.logout();
    window.location.href = "/login";
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
          <Image
            src={LOGO_URL}
            alt="K-Workmate"
            fittingType="fit"
            className="h-16 w-16 rounded-2xl"
          />
          <h1 className="text-xl font-semibold text-foreground">{t("access.deniedTitle")}</h1>
          <p className="text-sm text-muted-foreground">{t("access.deniedBody")}</p>
          <Button variant="outline" onClick={handleLogout} className="mt-2">
            <LogOut className="mr-2 h-4 w-4" /> {t("access.signOut")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}