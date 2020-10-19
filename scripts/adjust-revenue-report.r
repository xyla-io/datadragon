# Attach input parameters
attach(input[[1]])

# Load the Adjust client
library(httr)
library(data.table)
library(adjust)
# Set Adjust user and app credentials
adjust.setup(user.token=usertoken, app.token=apptoken)

# Calculate cohort dates
startdate <- as.Date(start)
enddate <- startdate + floor(as.numeric(Sys.Date() - startdate) / 7) * 7 - 1
cohorts <- seq(startdate, enddate - 1, 7)

collectcohort <- function(cohort) {
	# Retrieve the revenue data for one cohort
	data <- adjust.cohorts(kpis = c("revenue"), start_date = format(cohort), end_date = format(cohort + 6), period=period)

	# Transpose the periods from rows to columns
	if (is.null(maxperiod)) {
		maxperiod <<- data[, max(period)]
	}
	emptyrow <- data.table(period = 0:maxperiod, revenue = NA)
	rows <- data[, as.list(setNames(merge(emptyrow, .SD, by = c("period"), all = TRUE)[, revenue.y], 0:maxperiod)), by = tracker_name, .SDcols = c("period", "revenue")]
	rows[, cohort := paste(cohort, cohort + 6, sep = " - ") ]

	# Append the new rows to the collation table
	if (is.null(table)) {
		table <<- rows
	} else {
		table <<- rbind(table, rows)
	}

	format(cohort)
}
maxperiod <- NULL
table <- NULL

sapply(cohorts, collectcohort)

# Sort the data
table <- table[order(tracker_name, cohort)]
setcolorder(table, c(maxperiod + 3, 1, 2:(maxperiod + 2)))

# Convert the data to .csv format
out <- capture.output(write.csv(table, file = "", eol = "\r", row.names = FALSE))
list(result = out)
