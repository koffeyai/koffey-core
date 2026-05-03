import React, { useState, forwardRef, useEffect } from 'react';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Eye, EyeOff, CheckCircle, AlertCircle } from 'lucide-react';

interface PasswordInputProps {
  currentPassword: string;
  onChange: () => void;
  onInput: () => void;
}

interface PasswordStrength {
  score: number;
  text: string;
  color: string;
}

const getPasswordStrength = (password: string): PasswordStrength => {
  if (!password) return { score: 0, text: '', color: '' };
  if (password.length < 8) return { score: 1, text: 'Too short', color: 'text-red-500' };
  if (password.length >= 8 && /[A-Za-z]/.test(password) && /[0-9]/.test(password)) {
    return { score: 3, text: 'Strong', color: 'text-green-500' };
  }
  if (password.length >= 8) return { score: 2, text: 'Good', color: 'text-yellow-500' };
  return { score: 1, text: 'Weak', color: 'text-red-500' };
};

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ currentPassword, onChange, onInput }, ref) => {
    const [showPassword, setShowPassword] = useState(false);
    const [displayPassword, setDisplayPassword] = useState(currentPassword);

    useEffect(() => {
      setDisplayPassword(currentPassword);
    }, [currentPassword]);

    useEffect(() => {
      const interval = setInterval(() => {
        if (ref && typeof ref === 'object' && ref.current) {
          const fieldValue = ref.current.value;
          if (fieldValue !== displayPassword) {
            setDisplayPassword(fieldValue);
          }
        }
      }, 100);

      return () => clearInterval(interval);
    }, [ref, displayPassword]);

    const passwordStrength = getPasswordStrength(displayPassword);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setDisplayPassword(value);
      onChange();
    };

    const handleInputEvent = (e: React.FormEvent<HTMLInputElement>) => {
      const value = (e.target as HTMLInputElement).value;
      setDisplayPassword(value);
      onInput();
    };

    return (
      <div>
        <Label htmlFor="password">Password</Label>
        <div className="relative">
          <input
            ref={ref}
            id="password"
            name="password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="new-password"
            spellCheck="false"
            data-lpignore="true"
            data-form-type="other"
            onChange={handleInputChange}
            onInput={handleInputEvent}
            placeholder="Create a secure password"
            required
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm pr-10 autofill-detect"
            minLength={8}
          />
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="absolute right-2 top-1/2 h-auto -translate-y-1/2 p-1 hover:bg-transparent"
            onClick={() => setShowPassword(!showPassword)}
            aria-label={showPassword ? 'Hide password' : 'Show password'}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </Button>
        </div>
        {displayPassword && (
          <div className="mt-2 flex items-center gap-2">
            {passwordStrength.score >= 2 ? (
              <CheckCircle className="w-4 h-4 text-green-500" />
            ) : (
              <AlertCircle className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-xs ${passwordStrength.color}`}>
              Password strength: {passwordStrength.text}
            </span>
          </div>
        )}
        {displayPassword && passwordStrength.score < 2 && (
          <p className="mt-1 text-xs text-gray-600">
            Use at least 8 characters with letters and numbers
          </p>
        )}
      </div>
    );
  }
);

PasswordInput.displayName = 'PasswordInput';

export default PasswordInput;
