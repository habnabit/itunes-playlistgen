const ExtractTextPlugin = require("extract-text-webpack-plugin");
const UglifyJSPlugin = require("uglifyjs-webpack-plugin");
const path = require("path");

const extractSass = new ExtractTextPlugin("site.css");

module.exports = {
  entry: "./app/index.jsx",
  output: {
    filename: "site.js",
    path: path.resolve(__dirname, "dist"),
  },
  devtool: "source-map",
  module: {
    rules: [{
      test: /\.sass$/,
      use: extractSass.extract({
        use: [{
          loader: "css-loader",
          options: {
            sourceMap: true,
          },
        }, {
          loader: "sass-loader",
          options: {
            sourceMap: true,
          },
        }],
        fallback: "style-loader",
      })
    }, {
      test: /\.jsx?$/,
      exclude: /node_modules/,
      use: {
        loader: "babel-loader",
      },
    }],
  },
  plugins: [
    extractSass,
    //new UglifyJSPlugin({extractComments: true}),
  ],
};
