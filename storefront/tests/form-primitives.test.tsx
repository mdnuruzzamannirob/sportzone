// @vitest-environment jsdom
import * as fields from '../src/components/ui/fields'
import * as form from '../src/components/ui/form'
import * as feedback from '../src/components/ui/feedback'
import * as overlays from '../src/components/ui/overlays'
import * as button from '../src/components/ui/button'
import { formPrimitiveTests } from '../../tests/helpers/form-primitives'

formPrimitiveTests('storefront', {
  ...fields,
  ...form,
  ...feedback,
  ...overlays,
  ...button,
})
