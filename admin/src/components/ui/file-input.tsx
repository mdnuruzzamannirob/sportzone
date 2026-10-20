import type { ComponentProps } from 'react'
import { Input } from './primitives'

// A real native picker retains keyboard, accept, capture and file-change semantics.
export function FileInput({
  className = '',
  prompt = 'Choose a file',
  ...props
}: Omit<ComponentProps<typeof Input>, 'type'> & { prompt?: string }) {
  return (
    <div className={`ui-file-picker ${className}`} data-disabled={props.disabled || undefined}>
      <svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M12 16V4m-4 4 4-4 4 4M4 15v5h16v-5" />
      </svg>
      <span className="ui-file-picker__prompt" aria-hidden="true">{prompt}</span>
      <Input {...props} type="file" className="ui-file-picker__input" />
    </div>
  )
}
