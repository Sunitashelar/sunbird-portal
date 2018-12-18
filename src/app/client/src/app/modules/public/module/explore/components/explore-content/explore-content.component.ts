import {
    PaginationService, ResourceService, ConfigService, ToasterService, INoResultMessage,
    ICard, ILoaderMessage, UtilService, NavigationHelperService
} from '@sunbird/shared';
import { SearchService, PlayerService, OrgDetailsService, UserService, FrameworkService } from '@sunbird/core';
import { IPagination } from '@sunbird/announcement';
import { PublicPlayerService } from '../../../../services';
import { combineLatest, Subject } from 'rxjs';
import { Component, OnInit, OnDestroy, EventEmitter } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import * as _ from 'lodash';
import { IInteractEventEdata, IImpressionEventInput } from '@sunbird/telemetry';
import { takeUntil, map, mergeMap, first, filter, debounceTime } from 'rxjs/operators';
import { CacheService } from 'ng2-cache-service';
@Component({
    templateUrl: './explore-content.component.html',
    styleUrls: ['./explore-content.component.css']
})
export class ExploreContentComponent implements OnInit, OnDestroy {

    public showLoader = true;
    public showLoginModal = false;
    public baseUrl: string;
    public noResultMessage: INoResultMessage;
    public filterType: string;
    public queryParams: any;
    public hashTagId: string;
    public unsubscribe$ = new Subject<void>();
    public telemetryImpression: IImpressionEventInput;
    public inViewLogs = [];
    public sortIntractEdata: IInteractEventEdata;
    public dataDrivenFilters: any = {};
    public dataDrivenFilterEvent = new EventEmitter();
    public initFilters = false;
    public facets: Array<string>;
    public facetsList: any;
    public paginationDetails: IPagination;
    public contentList: Array<ICard> = [];
    public cardIntractEdata: IInteractEventEdata;
    public loaderMessage: ILoaderMessage;

    constructor(public searchService: SearchService, public router: Router,
        public activatedRoute: ActivatedRoute, public paginationService: PaginationService,
        public resourceService: ResourceService, public toasterService: ToasterService,
        public configService: ConfigService, public utilService: UtilService, public orgDetailsService: OrgDetailsService,
        public navigationHelperService: NavigationHelperService, private publicPlayerService: PublicPlayerService,
        public userService: UserService, public frameworkService: FrameworkService,
        public cacheService: CacheService) {
        this.paginationDetails = this.paginationService.getPager(0, 1, this.configService.appConfig.SEARCH.PAGE_LIMIT);
        this.filterType = this.configService.appConfig.explore.filterType;
        this.setTelemetryData();
    }
    ngOnInit() {
        this.orgDetailsService.getOrgDetails(this.activatedRoute.snapshot.params.slug).pipe(
            mergeMap((orgDetails: any) => {
            this.hashTagId = orgDetails.hashTagId;
            this.initFilters = true;
            return this.dataDrivenFilterEvent;
            }), first()
        ).subscribe((filters: any) => {
            this.dataDrivenFilters = filters;
            this.fetchContentOnParamChange();
            this.setNoResultMessage();
            },
            error => {
                this.router.navigate(['']);
            }
        );
    }
    public getFilters(filters) {
        this.facets = filters.map(element => element.code);
        const defaultFilters = _.reduce(filters, (collector: any, element) => {
            if (element.code === 'board') {
            collector.board = _.get(_.orderBy(element.range, ['index'], ['asc']), '[0].name') || '';
            }
            return collector;
        }, {});
        this.dataDrivenFilterEvent.emit(defaultFilters);
    }
    private fetchContentOnParamChange() {
        combineLatest(this.activatedRoute.params, this.activatedRoute.queryParams)
        .pipe( debounceTime(5), // wait for both params and queryParams event to change
            map(result => ({params: { pageNumber: Number(result[0].pageNumber)}, queryParams: result[1]})),
            takeUntil(this.unsubscribe$)
        ).subscribe(({params, queryParams}) => {
            this.showLoader = true;
            this.paginationDetails.currentPage = params.pageNumber;
            this.queryParams = { ...queryParams };
            this.contentList = [];
            this.fetchContents();
        });
    }
    private fetchContents() {
        let filters = _.pickBy(this.queryParams, (value: Array<string> | string) => value && value.length);
        filters = _.omit(filters, ['key', 'sort_by', 'sortType']);
        filters.contentType = filters.contentType || ['Collection', 'TextBook', 'LessonPlan', 'Resource', 'Story', 'Worksheet', 'Game'];
        const softConstraintFilter = {
            channel: this.hashTagId,
            board: [this.dataDrivenFilters.board]
          };
          const manipulatedData = this.utilService.manipulateSoftConstraint(filters,
            softConstraintFilter, _.get(this.activatedRoute.snapshot, 'data.softConstraints'));
        const option = {
            filters: manipulatedData.filters,
            limit: this.configService.appConfig.SEARCH.PAGE_LIMIT,
            pageNumber: this.paginationDetails.currentPage,
            query: this.queryParams.key,
            softConstraints: manipulatedData.softConstraints,
            facets: this.facets,
            params: this.configService.appConfig.ExplorePage.contentApiQueryParams
        };
        this.frameworkService.channelData$.subscribe((channelData) => {
          if (!channelData.err) {
            option.params.framework = _.get(channelData, 'channelData.defaultFramework');
          }
        });
        this.searchService.contentSearch(option)
        .subscribe(data => {
            this.showLoader = false;
            this.facetsList = this.searchService.processFilterData(_.get(data, 'result.facets'));
            this.paginationDetails = this.paginationService.getPager(data.result.count, this.paginationDetails.currentPage,
                this.configService.appConfig.SEARCH.PAGE_LIMIT);
            const { constantData, metaData, dynamicFields } = this.configService.appConfig.LibrarySearch;
            this.contentList = this.utilService.getDataForCard(data.result.content, constantData, dynamicFields, metaData);
        }, err => {
            this.showLoader = false;
            this.contentList = [];
            this.facetsList = [];
            this.paginationDetails = this.paginationService.getPager(0, this.paginationDetails.currentPage,
                this.configService.appConfig.SEARCH.PAGE_LIMIT);
            this.toasterService.error(this.resourceService.messages.fmsg.m0051);
        });
    }
    public navigateToPage(page: number): void {
        if (page < 1 || page > this.paginationDetails.totalPages) {
            return;
        }
        const url = this.router.url.split('?')[0].replace(/.$/, page.toString());
        this.router.navigate([url], { queryParams: this.queryParams });
    }
    private setTelemetryData() {
        this.telemetryImpression = {
            context: {
                env: this.activatedRoute.snapshot.data.telemetry.env
            },
            edata: {
                type: this.activatedRoute.snapshot.data.telemetry.type,
                pageid: this.activatedRoute.snapshot.data.telemetry.pageid,
                uri: this.router.url,
                subtype: this.activatedRoute.snapshot.data.telemetry.subtype
            }
        };
        this.cardIntractEdata = {
            id: 'content-card',
            type: 'click',
            pageid: this.activatedRoute.snapshot.data.telemetry.pageid
        };
    }
    public playContent(event) {
        if (!this.userService.loggedIn && event.data.contentType === 'Course') {
            this.showLoginModal = true;
            this.baseUrl = '/' + 'learn' + '/' + 'course' + '/' + event.data.metaData.identifier;
        } else {
            this.publicPlayerService.playContent(event);
        }
    }
    public inView(event) {
        _.forEach(event.inview, (elem, key) => {
            const obj = _.find(this.inViewLogs, { objid: elem.data.metaData.identifier});
            if (!obj) {
                this.inViewLogs.push({
                    objid: elem.data.metaData.identifier,
                    objtype: elem.data.metaData.contentType || 'content',
                    index: elem.id
                });
            }
        });
        this.telemetryImpression.edata.visits = this.inViewLogs;
        this.telemetryImpression.edata.subtype = 'pageexit';
        this.telemetryImpression = Object.assign({}, this.telemetryImpression);
    }
    ngOnDestroy() {
        this.unsubscribe$.next();
        this.unsubscribe$.complete();
    }
    private setNoResultMessage() {
        this.noResultMessage = {
            'message': _.get(this.resourceService, 'messages.stmsg.m0007') || 'No results found',
            'messageText': _.get(this.resourceService, 'messages.stmsg.m0006') || 'Please search for something else.'
        };
    }
}