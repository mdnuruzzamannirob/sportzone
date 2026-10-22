'use client'

import {
  Checkbox,
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Radio,
  RadioGroup,
  Select,
  TextArea,
  TextField,
  type CheckboxProps,
  type RadioGroupProps,
  type TextFieldProps,
} from './primitives'

type FieldContent = { label: string; description?: string; error?: string }
type TextProps = Omit<TextFieldProps, 'children' | 'className'> &
  FieldContent & { id: string; multiline?: boolean; rows?: number }

export function TextInput({
  label,
  description,
  error,
  multiline = false,
  rows = 4,
  isRequired,
  ...props
}: TextProps) {
  return (
    <TextField
      {...props}
      isRequired={isRequired}
      isInvalid={error ? true : props.isInvalid}
      className="w-full"
    >
      <Label className={error ? 'text-danger-soft-foreground' : undefined}>{label}</Label>
      {multiline ? <TextArea rows={rows} /> : <Input />}
      {description && <Description>{description}</Description>}
      <FieldError className="text-danger-soft-foreground">{error}</FieldError>
    </TextField>
  )
}

export type SelectOption = { value: string; label: string; disabled?: boolean }
type SelectProps = FieldContent & {
  id: string
  name?: string
  value: string | null
  onChange: (value: string | null) => void
  options: readonly SelectOption[]
  isDisabled?: boolean
  isRequired?: boolean
}
export function SelectField({
  label,
  description,
  error,
  options,
  onChange,
  isRequired,
  ...props
}: SelectProps) {
  return (
    <Select
      {...props}
      isRequired={isRequired}
      isInvalid={error ? true : undefined}
      disabledKeys={options.filter((option) => option.disabled).map((option) => option.value)}
      onChange={(value) => {
        if (typeof value === 'string' || value === null) onChange(value)
      }}
      className="w-full"
    >
      <Label className={error ? 'text-danger-soft-foreground' : undefined}>{label}</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      {description && <Description>{description}</Description>}
      <FieldError className="text-danger-soft-foreground">{error}</FieldError>
      <Select.Popover>
        <ListBox>
          {options.map((option) => (
            <ListBox.Item key={option.value} id={option.value} textValue={option.label}>
              {option.label}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  )
}

export function CheckboxField({
  label,
  description,
  error,
  ...props
}: Omit<CheckboxProps, 'children' | 'className'> & FieldContent) {
  return (
    <Checkbox {...props} isInvalid={error ? true : props.isInvalid}>
      <Checkbox.Content>
        <Checkbox.Control>
          <Checkbox.Indicator />
        </Checkbox.Control>
        <Label className={error ? 'text-danger-soft-foreground' : undefined}>{label}</Label>
      </Checkbox.Content>
      {description && <Description>{description}</Description>}
      <FieldError className="text-danger-soft-foreground">{error}</FieldError>
    </Checkbox>
  )
}

export function RadioChoices({
  label,
  description,
  error,
  options,
  ...props
}: Omit<RadioGroupProps, 'children' | 'className'> &
  FieldContent & { options: readonly SelectOption[] }) {
  return (
    <RadioGroup {...props} isInvalid={error ? true : props.isInvalid}>
      <Label className={error ? 'text-danger-soft-foreground' : undefined}>{label}</Label>
      {options.map((option) => (
        <Radio key={option.value} value={option.value} isDisabled={option.disabled}>
          <Radio.Content>
            <Radio.Control>
              <Radio.Indicator />
            </Radio.Control>
            <Label className={error ? 'text-danger-soft-foreground' : undefined}>
              {option.label}
            </Label>
          </Radio.Content>
        </Radio>
      ))}
      {description && <Description>{description}</Description>}
      <FieldError className="text-danger-soft-foreground">{error}</FieldError>
    </RadioGroup>
  )
}
