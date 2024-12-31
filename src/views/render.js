const config = require("../config");

function getRenderView({ data, from, to, exportType }) {
  return `
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <link rel="shortcut icon" href="data:image/x-icon;," type="image/x-icon">
  </head>
  <body>
    <canvas id="renderer"></canvas>

    <script async type="module">
      import { Engine } from "/packages/rendley-sdk";

      const renderer = document.getElementById("renderer");


      if (!renderer) {
          throw new Error("Renderer canvas not found");
      }
     
      const engine = Engine.getInstance();

      await engine.init({
        license: {
          licenseName: "${config.license.licenseName}",
          licenseKey: "${config.license.licenseKey}",
        },
        display: {
          view: renderer,
        }
      });

      await Engine.deserialize(${JSON.stringify(data)});
         


      engine.getSettings().setDecoderPreferredAcceleration("${
        config.rendering.preferredDecodingAcceleration
      }");
      
      engine.getSettings().setEncoderPreferredAcceleration("${
        config.rendering.preferredEncodingAcceleration
      }"); 

      window.exportVideo = async () => {
        const exportResult = await engine.export({ from: ${from}, to: ${to}, type: "${exportType}" });
     
        if (exportResult !== null)
        {
          const buffer = await exportResult.blob.arrayBuffer();
          
          const buffer_size = ${config.rendering.chunkPartialBufferSize};

          window.prepareBuffer?.(buffer.byteLength);

          for (let i = 0; i < buffer.byteLength; i += buffer_size) {
            const chunk = buffer.slice(i, i + buffer_size);
            await window.feedBuffer?.(Array.from(new Uint8Array(chunk))); 
          }

          return true;
        } else {
          return false;
        }
      };
    </script>
  </body>
</html>
`;
}

module.exports = getRenderView;
