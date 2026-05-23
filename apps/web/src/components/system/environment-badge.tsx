interface EnvironmentBadgeProps {
  environment: string;
  size?: 'sm' | 'md';
}

export function EnvironmentBadge({ environment, size = 'sm' }: EnvironmentBadgeProps) {
  const env = environment.toLowerCase();

  const styles: Record<string, string> = {
    staging: 'border-yellow-500/40 bg-yellow-500/10 text-yellow-600 dark:text-yellow-300',
    production: 'border-border bg-muted text-muted-foreground',
    local: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300',
    development: 'border-blue-500/40 bg-blue-500/10 text-blue-600 dark:text-blue-300',
    unknown: 'border-border bg-muted text-muted-foreground',
  };

  const labels: Record<string, string> = {
    staging: 'STAGING',
    production: 'production',
    local: 'LOCAL',
    development: 'DEV',
  };

  const color = styles[env] ?? styles.unknown;
  const label = labels[env] ?? environment;
  const padding = size === 'md' ? 'px-3 py-1 text-xs' : 'px-2 py-0.5 text-[10px]';

  return (
    <span className={`inline-flex items-center rounded-full border font-semibold tracking-widest uppercase ${padding} ${color}`}>
      {label}
    </span>
  );
}
