import React from 'react';

interface CardProps {
  children: React.ReactNode;
  className?: string;
  title?: string;
  action?: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ children, className = '', title, action }) => (
  <div className={`bg-brand-dark border border-brand-gray p-6 rounded-xl ${className}`}>
    {(title || action) && (
      <div className="flex justify-between items-center mb-4">
        {title && <h3 className="text-xl font-bold text-brand-white tracking-tight">{title}</h3>}
        {action && <div>{action}</div>}
      </div>
    )}
    {children}
  </div>
);

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  className = '', 
  ...props 
}) => {
  const baseStyles = "font-medium transition-all duration-200 rounded-lg flex items-center justify-center gap-2";
  
  const variants = {
    primary: "bg-brand-red text-white hover:bg-brand-redHover shadow-[0_0_15px_rgba(220,38,38,0.3)]",
    secondary: "bg-brand-gray text-white border border-neutral-800 hover:bg-neutral-800",
    danger: "bg-red-900/20 text-red-500 border border-red-900/50 hover:bg-red-900/40",
    ghost: "bg-transparent text-brand-muted hover:text-white hover:bg-brand-gray/50"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-sm",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`} 
      {...props}
    >
      {children}
    </button>
  );
};

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({ label, className = '', ...props }) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className="text-xs text-brand-muted uppercase tracking-wider font-semibold">{label}</label>}
    <input 
      className={`bg-black border border-brand-gray rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red transition-all placeholder-neutral-700 ${className}`}
      {...props}
    />
  </div>
);

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  options: { value: string; label: string }[];
}

export const Select: React.FC<SelectProps> = ({ label, options, className = '', ...props }) => (
  <div className="flex flex-col gap-1 w-full">
    {label && <label className="text-xs text-brand-muted uppercase tracking-wider font-semibold">{label}</label>}
    <select 
      className={`bg-black border border-brand-gray rounded-lg px-4 py-2 text-white focus:outline-none focus:border-brand-red focus:ring-1 focus:ring-brand-red transition-all ${className}`}
      {...props}
    >
      {options.map(opt => (
        <option key={opt.value} value={opt.value}>{opt.label}</option>
      ))}
    </select>
  </div>
);
