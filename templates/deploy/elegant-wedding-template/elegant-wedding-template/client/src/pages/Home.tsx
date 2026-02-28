import { Button } from "@/components/ui/button";
import { APP_LOGO, APP_TITLE } from "@/const";

/**
 * Build polished static experiences. Visit the README for the full playbook.
 * All content in this page are only for example, delete if unneeded
 */
export default function Home() {
  // If theme is switchable in App.tsx, we can implement theme toggling like this:
  // const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen flex flex-col">
      <header className="w-full border-b px-4 flex items-center h-16">
        <div className="flex items-center gap-2">
          <img
            src={APP_LOGO}
            className="h-8 w-8 rounded-lg border-border bg-background object-cover"
          />
          <span className="text-xl font-bold">{APP_TITLE}</span>
        </div>
      </header>
      <main>
        Example Page
        <Button variant="default">Example Button</Button>
      </main>
    </div>
  );
}
