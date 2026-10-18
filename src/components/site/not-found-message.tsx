import { TextLink } from "@/components/primitives";
import { StatusMessage } from "@/components/site/status-message";
import { primaryNav } from "@/lib/site";

/** The 404 band. Suggests the first primary-nav links, so they follow the nav. */
export function NotFoundMessage() {
  return (
    <StatusMessage eyebrow="404" title="Page not found" body="The page you're looking for doesn't exist or has moved.">
      <nav aria-label="Suggestions" className="flex flex-wrap justify-center gap-x-8 gap-y-3">
        {primaryNav.slice(0, 3).map((link) => (
          <TextLink key={link.href} href={link.href} label>
            {link.label}
          </TextLink>
        ))}
      </nav>
    </StatusMessage>
  );
}
