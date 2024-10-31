const config = require("../config");

function getRenderView({ data, from, to, exportType }) {
  return `
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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

      
      engine.getSettings().setDecoderPreferredAcceleration("${
        config.rendering.preferredDecodingAcceleration
      }");
      
      engine.getSettings().setEncoderPreferredAcceleration("${
        config.rendering.preferredEncodingAcceleration
      }");
      
    
      
      await Engine.deserialize(${JSON.stringify(data)});


      window.exportVideo = async () => {
        const { blob } = await engine.export({ from: ${from}, to: ${to}, type: "${exportType}" });
     
        const buffer = await blob.arrayBuffer();
        
        const buffer_size = ${config.rendering.chunkPartialBufferSize};

        window.prepareBuffer?.(buffer.byteLength);

        for (let i = 0; i < buffer.byteLength; i += buffer_size) {
          const chunk = buffer.slice(i, i + buffer_size);
          await window.feedBuffer?.(Array.from(new Uint8Array(chunk))); 
        }
      };
    </script>
  </body>
</html>
`;
}

module.exports = getRenderView;
