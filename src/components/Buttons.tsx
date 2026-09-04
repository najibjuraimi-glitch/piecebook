import React from 'react'

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement>

const base =
  'inline-flex w-full min-h-[48px] items-center justify-center rounded-xl px-5 text-body font-semibold transition-colors duration-150 ease-out disabled:opacity-50 disabled:pointer-events-none'

export function PrimaryButton({ className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} bg-accent text-white hover:bg-[#B2511F] active:bg-[#9E4719] ${className}`}
    />
  )
}

export function GhostButton({ className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} border border-line bg-transparent text-ink hover:bg-white active:bg-[#F0ECE4] ${className}`}
    />
  )
}

export function DangerGhostButton({ className = '', ...props }: ButtonProps) {
  return (
    <button
      type="button"
      {...props}
      className={`${base} border border-line bg-transparent text-bad hover:bg-white active:bg-[#F0ECE4] ${className}`}
    />
  )
}
