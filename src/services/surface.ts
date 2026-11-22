/** Anything with a pixel size: a browser canvas, an offscreen canvas, a WeChat canvas. */
export interface Surface {
  width: number;
  height: number;
}

/** An image source drawImage accepts. Browser images expose naturalWidth; WeChat images only width. */
export type Drawable = CanvasImageSource & { width?: number | SVGAnimatedLength; height?: number | SVGAnimatedLength; naturalWidth?: number; naturalHeight?: number };

export function sourceSize(image: Drawable) {
  const read = (natural: number | undefined, plain: unknown) =>
    natural || (typeof plain === "number" ? plain : 0);
  return { width: read(image.naturalWidth, image.width), height: read(image.naturalHeight, image.height) };
}
