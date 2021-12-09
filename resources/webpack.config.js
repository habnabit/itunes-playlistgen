const ESLintWebpackPlugin = require('eslint-webpack-plugin')
const MiniCssExtractPlugin = require('mini-css-extract-plugin')
const path = require('path')

const STATIC = path.resolve(__dirname, '../playlistgen/static')

module.exports = {
    mode: 'development',
    entry: './app/index.tsx',
    output: {
        filename: 'site.js',
        path: STATIC,
        publicPath: '/_static',
    },
    resolve: {
        extensions: ['.ts', '.tsx', '.js', '.json'],
        fallback: {
            buffer: require.resolve('buffer/'),
            crypto: require.resolve('crypto-browserify'),
            stream: require.resolve('stream-browserify'),
            vm: require.resolve('vm-browserify'),
        },
    },
    module: {
        rules: [
            {
                test: /\.sass$/,
                use: [
                    MiniCssExtractPlugin.loader,
                    {
                        loader: 'css-loader',
                        options: {
                            sourceMap: true,
                        },
                    },
                    {
                        loader: 'sass-loader',
                        options: {
                            sourceMap: true,
                        },
                    },
                ],
            },
            {
                test: /\.tsx?$/,
                exclude: /node_modules/,
                use: 'ts-loader',
            },
        ],
    },
    plugins: [
        new ESLintWebpackPlugin({
            extensions: ['ts', 'tsx'],
            exclude: ['/node_modules/'],
        }),
        new MiniCssExtractPlugin({
            filename: 'site.css',
        }),
    ],
    externals: {},
    devServer: {
        static: STATIC,
        compress: true,
        client: {
            overlay: {
                errors: true,
                warnings: false,
            },
        },
        proxy: {
            '/_api': {
                target: 'http://[::1]:9091',
            },
            '/app': {
                target: 'http://[::1]:9091',
            },
        },
    },
}
