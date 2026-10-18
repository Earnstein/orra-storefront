import { TextLink } from "@/components/primitives";
import { StatusMessage } from "@/components/site/status-message";
import { primaryNav } from "@/lib/site";

/** An archived product's page: its name, that it's gone, and where to shop instead. */
export function ArchivedProduct({ name }: { name: string }) {
  return (
    <StatusMessage eyebrow="No longer available" title={name} body="This piece has left the collection. Explore what's new instead.">
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
