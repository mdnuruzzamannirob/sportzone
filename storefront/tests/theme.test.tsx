// @vitest-environment jsdom
import { ThemePreferenceSelect } from '../src/components/ui/theme-preference'
import { themeInteractionTests } from '../../tests/theme-interactions'

themeInteractionTests('storefront', ThemePreferenceSelect)
