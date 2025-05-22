'use strict';

const eejs = require('ep_etherpad-lite/node/eejs/');
const settings = require('ep_etherpad-lite/node/utils/Settings');
const Busboy = require('busboy');
const StreamUpload = require('stream_upload');
const uuid = require('uuid');
const path = require('path');
const mimetypes = require('mime-db');
const url = require('url');
const fs = require('fs');
const fsp = fs.promises;
const { JSDOM } = require('jsdom');
const log4js = require('log4js');
const mime = require('mime');
const { exec } = require('child_process');
const util = require('util');
const execPromise = util.promisify(exec);

const logger = log4js.getLogger('ep_image_insert');

/**
 * ClientVars hook
 *
 * Exposes plugin settings from settings.json to client code inside clientVars variable
 * to be accessed from client side hooks
 *
 * @param {string} hookName Hook name ("clientVars").
 * @param {object} args Object containing the arguments passed to hook. {pad: {object}}
 * @param {function} cb Callback
 *
 * @returns {*} callback
 *
 * @see {@link http://etherpad.org/doc/v1.5.7/#index_clientvars}
 */
exports.clientVars = (hookName, args, cb) => {
  const pluginSettings = {
    storageType: 'local',
  };
  if (!settings.ep_image_insert) {
    settings.ep_image_insert = {};
  }
  const keys = Object.keys(settings.ep_image_insert);
  keys.forEach((key) => {
    if (key !== 'storage') {
      pluginSettings[key] = settings.ep_image_insert[key];
    }
  });
  if (settings.ep_image_insert.storage)
  {
    pluginSettings.storageType = settings.ep_image_insert.storage.type;
  }

  pluginSettings.mimeTypes = mimetypes;

  return cb({ep_image_insert: pluginSettings});
};

exports.eejsBlock_styles = (hookName, args, cb) => {
  args.content += "<link href='../static/plugins/ep_image_insert/static/css/ace.css' rel='stylesheet'>";
  return cb();
};

exports.eejsBlock_timesliderStyles = (hookName, args, cb) => {
  args.content += "<link href='../../static/plugins/ep_image_insert/static/css/ace.css' rel='stylesheet'>";
  args.content += '<style>.control-container{display:none}</style>';
  return cb();
};

exports.eejsBlock_body = (hookName, args, cb) => {
  const modal = eejs.require('ep_image_insert/templates/modal.ejs');
  args.content += modal;

  return cb();
};

const drainStream = (stream) => {
  stream.on('readable', stream.read.bind(stream));
};

exports.expressConfigure = (hookName, context) => {
  context.app.post('/p/:padId/pluginfw/ep_image_insert/upload', (req, res, next) => {
    const padId = req.params.padId;
    let busboy;
    const imageUpload = new StreamUpload({
      extensions: settings.ep_image_insert.fileTypes,
      maxSize: settings.ep_image_insert.maxFileSize,
      baseFolder: settings.ep_image_insert.storage.baseFolder,
      storage: settings.ep_image_insert.storage,
    });
    const storageConfig = settings.ep_image_insert.storage;
    if (storageConfig) {
      try {
        busboy = new Busboy({
          headers: req.headers,
          limits: {
            fileSize: settings.ep_image_insert.maxFileSize,
          },
        });
      } catch (error) {
        console.error('ep_image_insert ERROR', error);
        return next(error);
      }

      let isDone;
      const done = (error) => {
        if (error) {
          console.error('ep_image_insert UPLOAD ERROR', error);

          return;
        }

        if (isDone) return;
        isDone = true;

        req.unpipe(busboy);
        drainStream(req);
        busboy.removeAllListeners();
      };

      let uploadResult;
      const newFileName = uuid.v4();
      let accessPath = '';
      busboy.on('file', (fieldname, file, filename, encoding, mimetype) => {
        let savedFilename = path.join(padId, newFileName + path.extname(filename));

        if (settings.ep_image_insert.storage && settings.ep_image_insert.storage.type === 'local') {
          accessPath = new url.URL(savedFilename, settings.ep_image_insert.storage.baseURL);
          savedFilename = path.join(settings.ep_image_insert.storage.baseFolder, savedFilename);
        }
        file.on('limit', () => {
          const error = new Error('File is too large');
          error.type = 'fileSize';
          error.statusCode = 403;
          busboy.emit('error', error);
          imageUpload.deletePartials();
        });
        file.on('error', (error) => {
          busboy.emit('error', error);
        });

        uploadResult = imageUpload
            .upload(file, {type: mimetype, filename: savedFilename});
      });

      busboy.on('error', done);
      busboy.on('finish', () => {
        if (uploadResult) {
          uploadResult
              .then((data) => {
                if (accessPath) {
                  data = accessPath;
                }

                return res.status(201).json(data);
              })
              .catch((err) => res.status(500).json(err));
        }
      });
      req.pipe(busboy);
    }
  });
};

exports.padRemove = async (hookName, context) => {
  // If storageType is local, delete the folder for the images
  const {ep_image_insert: {storage: {type, baseFolder} = {}} = {}} = settings;
  if (type === 'local') {
    const dir = path.join(baseFolder, context.padID);
    try {
      await fsp.rm(dir, {recursive: true, force: true });
      logger.info(`[ep_image_insert] Successfully removed pad directory ${dir}`);
    } catch (err) {
      logger.error(`[ep_image_insert] Error removing pad directory ${dir}: ${err.message}`);
    }
  }
};

exports.import = async (hookName, context) => {
  const { srcFile, fileEnding, destFile } = context;

  // Robust diagnostic logging
  try {
    const sfLog = context && context.srcFile ? context.srcFile : 'UNKNOWN_SRC_FILE';
    const feLog = context && context.fileEnding ? context.fileEnding : 'UNKNOWN_FILE_ENDING';
    const dfLog = context && context.destFile ? context.destFile : 'UNKNOWN_DEST_FILE';
    console.log(`[ep_image_insert_CONSOLETEST] IMPORT HOOK CALLED. fileEnding: ${feLog}, srcFile: ${sfLog}, destFile: ${dfLog}`);
    logger.info(`[ep_image_insert_LOG4JSTEST] IMPORT HOOK CALLED. fileEnding: ${feLog}, srcFile: ${sfLog}, destFile: ${dfLog}`);
  } catch (e) {
    console.error('[ep_image_insert_CONSOLETEST] ERROR IN DIAGNOSTIC LOGGING:', e.message);
  }

  const convertibleTypes = ['.doc', '.docx', '.odt'];
  const ZWSP = '\u200B';

  try {
    // DOCX/DOC/ODT processing has been moved to ep_docx_html_customizer
    if (convertibleTypes.includes(fileEnding)) {
      logger.info(`[ep_image_insert] File type ${fileEnding} is now handled by ep_docx_html_customizer. Passing through.`);
      return false;
    } else if (fileEnding === '.html' || fileEnding === '.htm') {
      logger.info(`[ep_image_insert] Processing direct HTML file: ${srcFile}`);
      try {
        let htmlContent = await fsp.readFile(srcFile, 'utf8');
        const dom = new JSDOM(htmlContent);
        const document = dom.window.document;
        const images = document.querySelectorAll('img');
        let modified = false;

        logger.debug(`[ep_image_insert] Found ${images.length} image(s) in direct HTML: ${srcFile}`);
        
        for (const [index, img] of images.entries()) {
          let imgSrc = img.getAttribute('src');
          logger.debug(`[ep_image_insert] Direct HTML - Image ${index + 1}/${images.length}: Original src="${imgSrc}"`);

          if (!imgSrc) {
            logger.debug(`[ep_image_insert] Direct HTML - Image ${index + 1} has no src, skipping.`);
            continue;
          }

          if (imgSrc && !imgSrc.startsWith('http') && !imgSrc.startsWith('data:') && !imgSrc.startsWith('/')) {
            const imagePath = path.resolve(path.dirname(srcFile), imgSrc);
            logger.debug(`[ep_image_insert] Direct HTML - Image ${index + 1} is relative. Reading: ${imagePath}`);
            try {
              if (fs.existsSync(imagePath)) {
                const imageBuffer = await fsp.readFile(imagePath);
                const mimeType = mime.getType(imagePath) || 'application/octet-stream';
                imgSrc = `data:${mimeType};base64,${imageBuffer.toString('base64')}`;
                logger.debug(`[ep_image_insert] Direct HTML - Image ${index + 1} converted to data URI.`);
              } else {
                logger.warn(`[ep_image_insert] Direct HTML - Image ${index + 1} relative path not found: ${imagePath}.`);
                continue;
              }
            } catch (e) {
              logger.error(`[ep_image_insert] Direct HTML - Image ${index + 1} error reading/converting ${imagePath}: ${e.message}`);
              continue;
            }
          } else {
            logger.debug(`[ep_image_insert] Direct HTML - Image ${index + 1} src is not relative or already data/http: "${imgSrc ? imgSrc.substring(0,50)+'...' : 'EMPTY'}"`);
          }

          const outerSpan = document.createElement('span');
          outerSpan.textContent = ZWSP;
          let outerClasses = 'inline-image character image-placeholder';
          outerClasses += ` image:${encodeURIComponent(imgSrc)}`;
          const imgWidth = img.getAttribute('width') || img.style.width;
          const imgHeight = img.getAttribute('height') || img.style.height;
          if (imgWidth) outerClasses += ` image-width:${/^[0-9]+(\.\d+)?$/.test(imgWidth) ? `${imgWidth}px` : imgWidth}`;
          if (imgHeight) outerClasses += ` image-height:${/^[0-9]+(\.\d+)?$/.test(imgHeight) ? `${imgHeight}px` : imgHeight}`;
          const numWidth = parseFloat(imgWidth);
          const numHeight = parseFloat(imgHeight);
          if (!isNaN(numWidth) && numWidth > 0 && !isNaN(numHeight) && numHeight > 0) {
            outerClasses += ` imageCssAspectRatio:${(numWidth / numHeight).toFixed(4)}`;
          }
          outerSpan.className = outerClasses.trim();

          const fragment = document.createDocumentFragment();
          fragment.appendChild(document.createTextNode(ZWSP));
          fragment.appendChild(outerSpan);
          fragment.appendChild(document.createTextNode(ZWSP));

          img.parentNode.replaceChild(fragment, img);
          modified = true;
          logger.debug(`[ep_image_insert] Direct HTML - Image ${index + 1} replaced with ZWSP-span-ZWSP structure.`);
        }

        if (modified) {
          logger.info(`[ep_image_insert] Direct HTML file (${srcFile}) was modified. Writing changes back to ${srcFile}.`);
          await fsp.writeFile(srcFile, dom.serialize());
        } else {
          logger.info(`[ep_image_insert] Direct HTML file (${srcFile}) was not modified.`);
        }

        // Ensure the (potentially modified) srcFile is copied to destFile for core import process
        if (srcFile !== destFile) {
          logger.debug(`[ep_image_insert] Copying processed ${srcFile} to ${destFile} for core import.`);
          await fsp.copyFile(srcFile, destFile);
        } else {
          logger.debug(`[ep_image_insert] srcFile and destFile are the same (${srcFile}), no copy needed.`);
        }
        
        return true;
      } catch (err) {
        logger.error(`[ep_image_insert] Error processing direct HTML ${srcFile}: ${err.message}`, err.stack);
        return false;
      }
    } else {
      logger.info(`[ep_image_insert] File type '${fileEnding}' is not .doc, .docx, .odt, .html, or .htm. Skipping special image processing.`);
      return false;
    }
  } catch (err) {
    logger.error(`[ep_image_insert] Unhandled error in import hook: ${err.message}`, err.stack);
    return false;
  }
};

/**
* Hook to tell Etherpad that 'img' tags are supported during import.
*/
exports.ccRegisterBlockElements = (hookName, context, cb) => {
  return cb(['img']);
};
