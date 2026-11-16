# Hero image cleanup

Mode: built-in `image_gen` edit.

Input: `public/images/aura-galaxy-live.png` (supplied screenshot, kept unchanged).

Output: `public/images/aura-galaxy-clean.png` (2170 × 725 PNG).

The generated preview removes unwanted desktop text showing through the widget.
It is presented as a theme preview, rather than an unmodified app capture.

## Final prompt

```text
Use case: precise-object-edit.
Asset type: hero image for the existing Aura Windows desktop widget website.
Input image 1: EDIT TARGET, the actual existing hero screenshot.
Primary request: Remove ALL stray desktop/code/terminal text visible behind or through the translucent widget, including the ghosted monospace lines across the clock panel, through the music panel, at the top edge, and at the bottom/outside the widget. Fill only those contaminated background areas with the same clean near-black Galaxy starfield already present in the widget. The backdrop should look intentionally opaque and clean, with delicate stars, never any ghost writing.
Preserve invariants: Keep the original screenshot's composition, widget geometry, straight-on view, rounded dark frame, two-column layout, clock, CPU and RAM panels, sparklines, music-player panel, album thumbnail, buttons and crisp UI icons. Preserve the UI typography and all intended foreground text exactly, including "11:42", "Monday, 16 November", "CPU", "43%", "RAM", "63%", "9.9 / 15.8 GiB", "Previous", "Next", "Baawe prod. by @prodevanson | Ujjwaluzu", and "Ujjwal Baunthiyal". Keep the album thumbnail/person unchanged. Preserve panel boundaries, alignment, restrained navy-black palette, and white foreground text. No additional elements or content.
Framing: Match the existing very wide approximately 3:1 screenshot canvas and the widget's original placement within it, with only the existing very narrow surrounding margin. Keep the entire widget and all its controls visible; do not zoom, rotate, crop, or add a large empty background.
Avoid: Code, terminal text, desktop windows, stray letters, text bleeding through glass, watermarks, extra labels, altered app functionality, photographic environment, decorative device mockup. Only remove the unwanted background writing and repair the starfield.
```
