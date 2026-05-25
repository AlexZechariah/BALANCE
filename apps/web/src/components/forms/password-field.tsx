'use client';

import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function PasswordField({
  id,
  label,
  value,
  onChange,
  autoComplete,
  disabled,
  placeholder,
  error,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  disabled?: boolean;
  placeholder?: string;
  error?: string | null | undefined;
}) {
  const [visible, setVisible] = useState(false);

  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          type={visible ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          disabled={disabled}
          className="pr-10"
          placeholder={placeholder}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label={visible ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`}
          className="absolute right-0 top-0"
          onClick={() => setVisible((current) => !current)}
          disabled={disabled}
        >
          {visible ? <EyeOff /> : <Eye />}
        </Button>
      </div>
      {error && <p className="mt-1 text-sm text-destructive">{error}</p>}
    </div>
  );
}
