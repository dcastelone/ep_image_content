'use strict';

const Changeset = require('ep_etherpad-lite/static/js/Changeset');

exports.getLineHTMLForExport = async (hook, context) => {
  let lineContent = context.lineContent;
  const attribLine = context.attribLine;
  const apool = context.apool;

  if (attribLine) {
    let generatedHTML = '';
    let currentPos = 0;
    const opIter = Changeset.opIterator(attribLine);

    while (opIter.hasNext()) {
      const op = opIter.next();
      const opChars = op.chars;
      const textSegment = context.text.substring(currentPos, currentPos + opChars);

      let htmlSegment = Changeset.escapeText(textSegment); // Default: escaped text

      // Check for our image attribute
      const imageAttribValue = Changeset.opAttributeValue(op, 'image', apool);
      // Check if it's our placeholder NBSP
      if (imageAttribValue && textSegment === '\u00a0') { 
        try {
          // Value is the escaped src
          const src = unescape(imageAttribValue);
          if (src && (src.startsWith('data:') || src.startsWith('http') || src.startsWith('/'))) {
            // Generate the img tag
            let imgTag = `<img src="${Changeset.escapeText(src)}"`;
            imgTag += ` style="display:inline-block; max-width:100%; vertical-align:middle;"`;
            imgTag += `>`;
            htmlSegment = imgTag; // Replace placeholder NBSP with img tag
            console.log(`[ep_image_insert exportHTML] Exported image: ${imgTag}`);
          } else {
             console.warn(`[ep_image_insert exportHTML] Invalid unescaped image src: ${src}`);
             htmlSegment = '[Invalid Image Src]'; // Placeholder for error
          }
        } catch (e) {
          console.error(`[ep_image_insert exportHTML] Error unescaping image attribute: ${imageAttribValue}`, e);
          htmlSegment = '[Image Decode Error]'; // Placeholder for error
        }
      } else {
         // TODO: Handle other attributes (bold, italic, etc.) if needed for proper export
         // This part remains basic, only handling the image replacement.
      }

      generatedHTML += htmlSegment;
      currentPos += opChars;
    }
    context.lineContent = generatedHTML;
  } else {
     context.lineContent = Changeset.escapeText(context.text);
  }
};

exports.stylesForExport = (hook, padId, cb) => {
  cb('img { display:inline-block; max-width:100%; vertical-align:middle; }');
};
