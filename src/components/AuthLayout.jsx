import React from "react";
import { Image } from "@/components/ui/image";

const LOGO_URL =
  "https://media.base44.com/images/public/6abdfea3bcad266c314dcfd3/d5e014129_generated_8d71addc.png";

export default function AuthLayout({ icon: Icon, title, subtitle, footer, children }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          

          
          <span className="relative mx-auto mb-6 block h-16 w-16 overflow-hidden rounded-2xl">
            {/* The mark sits centred inside its own square, so the box clips only that empty surround. */}
            <Image
              src={LOGO_URL}
              alt="K-Workmate"
              fittingType="fit"
              className="absolute left-1/2 top-1/2 h-[113px] w-[113px] -translate-x-1/2 -translate-y-1/2"
            />
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-foreground">{title}</h1>
          {subtitle && <p className="text-muted-foreground mt-2">{subtitle}</p>}
        </div>
        <div className="bg-card rounded-2xl shadow-sm border border-border p-8">
          {children}
        </div>
        {footer &&
        <p className="text-center text-sm text-muted-foreground mt-6">{footer}</p>
        }
      </div>
    </div>);

}