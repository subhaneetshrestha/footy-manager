module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    // Reanimated 4 / Skia worklets support. Must stay last.
    plugins: ['react-native-worklets/plugin'],
  };
};
