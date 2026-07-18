import {
  Card,
  Code,
  Container,
  PageHeader,
  Stack,
} from "@lk-robotics/design-system-core";
import { useId, type PropsWithChildren, type ReactNode } from "react";

export interface TechnicalStoryLayoutProps extends PropsWithChildren {
  readonly title: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly meta?: ReactNode;
}

export interface StoryGuideProps {
  readonly title: string;
  readonly description: string;
  readonly eyebrow: string;
  readonly status?: ReactNode;
  readonly meta?: ReactNode;
  readonly actions?: ReactNode;
  readonly size?: "sm" | "md";
}

/** Shared Storybook introduction built only from the public LDS PageHeader. */
export function StoryGuide({
  title,
  description,
  eyebrow,
  status,
  meta,
  actions,
  size = "sm",
}: StoryGuideProps): ReactNode {
  return (
    <PageHeader
      size={size}
      eyebrow={eyebrow}
      title={title}
      description={description}
      status={status}
      meta={meta}
      actions={actions}
    />
  );
}

/**
 * Document-style composition for renderer-neutral contract stories.
 *
 * Container and PageHeader own the page rhythm and heading treatment. This is
 * deliberately not an application shell: technical stories have no product
 * navigation, commands, account chrome, or workflow state.
 */
export function TechnicalStoryLayout({
  title,
  description,
  eyebrow,
  meta = "Static technical contract",
  children,
}: TechnicalStoryLayoutProps): ReactNode {
  return (
    <main aria-label={title}>
      <Container size="read">
        <Stack gap="var(--space-8)">
          <StoryGuide
            eyebrow={eyebrow}
            title={title}
            description={description}
            meta={meta}
          />
          {children}
        </Stack>
      </Container>
    </main>
  );
}

export interface TechnicalSectionProps extends PropsWithChildren {
  readonly title: string;
  readonly description?: string;
}

/**
 * A semantic story section whose only visual surface is the public LDS Card.
 * Inline styles below provide heading rhythm only; they do not reconstruct a
 * card, panel, or other LDS-owned surface.
 */
export function TechnicalSection({
  title,
  description,
  children,
}: TechnicalSectionProps): ReactNode {
  const headingId = useId();

  return (
    <Stack as="section" gap="var(--space-3)" aria-labelledby={headingId}>
      <Stack gap="var(--space-1)">
        <h2
          id={headingId}
          style={{
            margin: 0,
            color: "var(--color-semantic-label-strong)",
            fontSize: "var(--heading2-size)",
            lineHeight: "var(--heading2-line)",
            letterSpacing: "var(--heading2-spacing)",
          }}
        >
          {title}
        </h2>
        {description === undefined ? null : (
          <p
            style={{
              margin: 0,
              maxWidth: "48rem",
              color: "var(--color-semantic-label-neutral)",
              fontSize: "var(--label1-size)",
              lineHeight: "var(--label1-reading-line)",
            }}
          >
            {description}
          </p>
        )}
      </Stack>
      <Card elevation="none" padding="var(--space-5)">
        {children}
      </Card>
    </Stack>
  );
}

export function JsonInspector({
  value,
  label,
}: {
  readonly value: unknown;
  readonly label: string;
}): ReactNode {
  return (
    <Code block aria-label={label} tabIndex={0} style={{ maxHeight: "28rem" }}>
      {JSON.stringify(value, null, 2)}
    </Code>
  );
}
