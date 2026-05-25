import { BrandMark } from '@/components/ui/brand-mark';
import { LanguageSwitcher } from '@/components/nav/language-switcher';
import { SignOutButton } from '@/components/nav/sign-out-button';

// Global header for every authenticated (app)/* page. Brand on the
// left, language switcher + sign-out on the right. Centered to the
// same max-w-md container the pages use so the brand aligns with
// page content underneath.
export function AppHeader() {
  return (
    <header className="mx-auto flex max-w-md items-center justify-between gap-3 px-5 pt-5">
      <BrandMark />
      <div className="flex items-center gap-2">
        <LanguageSwitcher />
        <SignOutButton />
      </div>
    </header>
  );
}
