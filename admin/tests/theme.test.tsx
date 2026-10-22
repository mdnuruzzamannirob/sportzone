// @vitest-environment jsdom
import { ThemePreferenceSelect } from '../src/components/ui/theme-preference'
import { themeInteractionTests } from '../../tests/helpers/theme-interactions'

themeInteractionTests('admin', ThemePreferenceSelect)
