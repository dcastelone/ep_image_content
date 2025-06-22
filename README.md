# ep_images_extended – Extended image content for etherpad

**Insert, resize, float, copy, cut & delete images.**  
`ep_images_extended` builds on `ep_image_insert` and other image upload plugins.  
The main difference is that images are built as custom span structures using the CSS background image attribute. This bypasses the Content Collector which always requires images to be block-level styles (so they couldn't share the line with text). As a result, we can now type around images, which allows the creation of more interactive pad content. The plugin includes some other features like click + drag resize, image float, and cut/copy/delete through a context menu. It was designed for compatibility with my forthcoming tables plugin. It's a pretty heavyweight plugin (some would say overengineered), because I was prioritizing meeting functional requirements for my project. Etherpad wizards might have tips for optimization, it would surely be appreciated.

![Demo](https://i.imgur.com/uTpL9Za.png)
---

## Installation

Install via the plugins menu or through:

pnpm run plugins i ep_images_extended

in your etherpad-lite directory.

---

## Configuration (settings.json)

Create (or merge) an **`ep_images_extended`** block at the root of `settings.json`.

| key | type | default | description |
|-----|------|---------|-------------|
| `fileTypes` | Array&lt;string&gt; | _none_ | List of **extensions** (no dot) that are allowed to upload.  If omitted any MIME that starts with `image/` is accepted. |
| `maxFileSize` | Number (bytes) | _unlimited_ | Reject files larger than this size. |
| `storage` | Object | `{ "type": "base64" }` | Where the image binary ends up.  See below. |

### Storage strategies

1. **Embedded Base-64** (default – zero config)
   ```jsonc
      "ep_images_extended": {
        "storage": {               
          "type": "base64" 
        },
        "fileTypes": ["jpeg", "jpg", "png", "gif", "bmp", "webp"],
        "maxFileSize": 5000000
      }
   ```
   Images are converted to data-URIs and live inside the pad. This has a pretty big performance impact.

2. **Amazon S3 with presigned uploads**
   ```jsonc
   "ep_images_extended": {
     "storage": {
       "type":   "s3_presigned",
       "region": "us-east-1",
       "bucket": "my-etherpad-images",
       "publicURL": "https://cdn.example.com/",    // optional – defaults to the S3 URL
       "expires": 900                               // optional – seconds (default 600)
     },
     "fileTypes": ["png", "jpg", "webp"],
     "maxFileSize": 10485760
   }
   ```
   The browser asks the Etherpad server for a presigned **PUT** URL, then uploads straight to S3 –
   the file never touches your app server. Access keys are **not** read from `settings.json`.*  The AWS SDK picks them up from environment variables.
   
   * `AWS_ACCESS_KEY_ID`
   * `AWS_SECRET_ACCESS_KEY`
   * `AWS_SESSION_TOKEN` (if using temporary credentials)
   
---

## Contributing

This was mostly made by LLMs (my requirements in this project were far beyond my coding ability at this time). Bug reports & PRs are welcome! See [`CONTRIBUTING.md`](CONTRIBUTING.md) for the coding guidelines and branching model.

---

## Credits / Upstream
This plugin started as a heavy rewrite of
[ep_image_insert](https://github.com/mamylinx/ep_image_insert)
by Mamy Linx, John McLear, Ilmar Türk and other contributors.