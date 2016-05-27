var gulp = require('gulp');
var concat = require('gulp-concat');

gulp.task('default', function() {
    return gulp.src([
		'gmxcore.js',
		'utilities.js',
		'jquery.treeview.js',
		'search.js'
	])
		.pipe(concat('search.js'))
		.pipe(gulp.dest('build'));
});
