const outline = `
in vec2 v_textureCoordinates;
uniform sampler2D colorTexture;
uniform vec4 outlineColor;

void main() {
  float depth = czm_readDepth(colorTexture, v_textureCoordinates);
  float depthDiff = 0.0;
  for (int i = -1; i <= 1; i++) {
    for (int j = -1; j <= 1; j++) {
      vec2 offset = vec2(float(i), float(j)) / czm_viewport.zw + v_textureCoordinates;
      depthDiff += abs(depth - czm_readDepth(colorTexture, offset));
    }
  }
  if (depthDiff > 0.05) {
    out_FragColor = outlineColor;
  } else {
    discard;
  }
}
`

export default outline