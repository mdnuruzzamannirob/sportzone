// @vitest-environment jsdom
import { ThemePreferenceSelect } from '../src/components/theme-preference'
import { themeInteractionTests } from '../../tests/theme-interactions'

themeInteractionTests('admin', ThemePreferenceSelect)
