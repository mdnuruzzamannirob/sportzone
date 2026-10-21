'use client'

import { Surface } from '../ui/index'
import Image from 'next/image'
import { useState } from 'react'

export type ProductImageSource = { src: string; alt: string }
// Call with a source key so a replacement image gets a fresh error state.
export function ProductImage({
  image,
  sizes = '(max-width: 639px) 50vw, (max-width: 1023px) 33vw, 25vw',
}: {
  image?: ProductImageSource
  sizes?: string
}) {
  const [failed, setFailed] = useState(false)
  return (
    <Surface className="aspect-square w-full overflow-hidden ">
      {image && !failed ? (
        <Image
          src={image.src}
          alt={image.alt}
          width={480}
          height={480}
          sizes={sizes}
          className="h-full w-full object-contain"
          onError={() => setFailed(true)}
        />
      ) : (
        <div className="flex h-full min-h-24 items-center justify-center p-4 text-center text-sm text-muted">
          Image unavailable
        </div>
      )}
    </Surface>
  )
}
