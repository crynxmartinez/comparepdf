"use client";

import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Monitor, Moon, Sun, Check } from "lucide-react";
import { cn } from "@/lib/utils";

type Theme = "light" | "dark" | "system";

export default function SettingsPage() {
  const [theme, setTheme] = useState<Theme>("system");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("theme") as Theme | null;
    if (stored) setTheme(stored);
  }, []);

  const applyTheme = (t: Theme) => {
    setTheme(t);
    localStorage.setItem("theme", t);

    const root = document.documentElement;
    if (t === "dark") {
      root.classList.add("dark");
    } else if (t === "light") {
      root.classList.remove("dark");
    } else {
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }
    }

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const themes: { value: Theme; label: string; icon: React.ReactNode }[] = [
    { value: "light", label: "Light", icon: <Sun className="h-5 w-5" /> },
    { value: "dark", label: "Dark", icon: <Moon className="h-5 w-5" /> },
    { value: "system", label: "System", icon: <Monitor className="h-5 w-5" /> },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Customize your comparison experience
        </p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">Appearance</Label>
            <p className="text-sm text-muted-foreground">
              Choose your preferred theme
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {themes.map((t) => (
              <button
                key={t.value}
                onClick={() => applyTheme(t.value)}
                className={cn(
                  "flex flex-col items-center gap-2 rounded-lg border-2 p-4 transition-colors",
                  theme === t.value
                    ? "border-primary bg-primary/5"
                    : "border-border hover:border-muted-foreground/50"
                )}
              >
                {t.icon}
                <span className="text-sm font-medium">{t.label}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label className="text-base font-semibold">About</Label>
            <p className="text-sm text-muted-foreground">
              CompareFiles — File Comparison Tool
            </p>
          </div>
          <Separator />
          <div className="space-y-2 text-sm text-muted-foreground">
            <p>
              <strong>Supported file types:</strong> PDF, Excel (.xlsx, .xls),
              CSV, Word (.docx), Text (.txt, .json, .xml, .md, .log)
            </p>
            <p>
              <strong>Storage:</strong> All data is stored locally in your
              browser using IndexedDB. No data is sent to any server.
            </p>
            <p>
              <strong>Reports:</strong> Download comparison reports as HTML or
              CSV files to save them on your computer.
            </p>
          </div>
        </div>
      </Card>

      {saved && (
        <div className="fixed bottom-4 right-4 flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm text-primary-foreground shadow-lg">
          <Check className="h-4 w-4" />
          Settings saved
        </div>
      )}
    </div>
  );
}
