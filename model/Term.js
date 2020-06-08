
exports.Term = class Term {
    constructor (term) {
        this.term = term;
        this.sportsCount = 0;
        this.techCount = 0;
        this.category = "";
        this.estimation = 0;
    }

    getSumCount() {
        return this.sportsCount + this.techCount;
    }

    updateCategory() {
        if (Math.abs(this.estimation) < 0.5) {
            this.category = "";
            return;
        }
        this.category = this.estimation > 0 ? "tech" : "sport";
    }

    getVectorValue() {
        return this.category === "sport" ? this.sportsCount : this.techCount;
    }
}