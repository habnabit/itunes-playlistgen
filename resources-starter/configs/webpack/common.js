// shared config (dev and prod)
const { resolve } = require('path')
const HtmlWebpackPlugin = require('html-webpack-plugin')

module.exports = {
    resolve: {
        extensions: ['.js', '.jsx', '.ts', '.tsx'],
        fallback: {
            buffer: require.resolve('buffer/'),
            crypto: require.resolve('crypto-browserify'),
            stream: require.resolve('stream-browserify'),
            vm: require.resolve('vm-browserify'),
        },
    },
    context: resolve(__dirname, '../../src'),
    module: {
        rules: [
            {
                test: [/\.jsx?$/, /\.tsx?$/],
                use: ['babel-loader'],
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
            {
                test: /\.(scss|sass)$/,
                use: ['style-loader', 'css-loader', 'sass-loader'],
            },
            {
                test: /\.(jpe?g|png|gif|svg)$/i,
                use: [
                    'file-loader?hash=sha512&digest=hex&name=img/[contenthash].[ext]',
                    'image-webpack-loader?bypassOnDebug&optipng.optimizationLevel=7&gifsicle.interlaced=false',
                ],
            },
        ],
    },
    plugins: [
        new HtmlWebpackPlugin({
            template: 'index.html.ejs',
            publicPath: '/',
        }),
    ],
    externals: {
        react: 'React',
        'react-dom': 'ReactDOM',
    },
    performance: {
        hints: false,
    },
}
