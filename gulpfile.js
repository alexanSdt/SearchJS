const gulp = require('gulp')
const concat = require('gulp-concat')

const src = [
    'gmxcore.js',
    'utilities.js',
    'jquery.treeview.js',
    'search.js'
]

gulp.task('default', function() {
    return gulp.src(src)
        .pipe(concat('search.js'))
        .pipe(gulp.dest('dist'))
})

gulp.task('watch', ['default'], function () {
    gulp.watch(src, ['default'])
})
