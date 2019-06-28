const MiniCssExtractPlugin = require("mini-css-extract-plugin");
const path = require("path");

module.exports = {
  mode: "development",
  entry: "./app/index.tsx",
  output: {
    filename: "site.js",
    path: path.resolve(__dirname, "../playlistgen/static"),
  },
  resolve: {
    extensions: [".ts", ".tsx", ".js", ".json"],
  },
  devtool: "inline-source-map",
  module: {
    rules: [{
      test: /\.sass$/,
      use: [
        MiniCssExtractPlugin.loader,
        {
          loader: "css-loader",
          options: {
            sourceMap: true,
          },
        }, {
          loader: "sass-loader",
          options: {
            sourceMap: true,
          },
        }
      ],
    }, {
      test: /\.tsx?$/,
      exclude: /node_modules/,
      loader: "ts-loader",
    }],
  },
  plugins: [
    new MiniCssExtractPlugin({
      filename: "site.css",
    }),
  ],
  externals: {
    "react": "React",
    "react-dom": "ReactDOM",
  },
};
