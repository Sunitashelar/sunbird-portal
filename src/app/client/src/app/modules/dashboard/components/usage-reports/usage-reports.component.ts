import { IInteractEventEdata, IInteractEventObject, TelemetryInteractDirective } from '@sunbird/telemetry';
import { IImpressionEventInput } from './../../../telemetry/interfaces/telemetry';
import { Component, OnInit, ViewChild } from '@angular/core';
import { UsageService } from './../../services';
import * as _ from 'lodash';
import { DomSanitizer } from '@angular/platform-browser';
import { UserService } from '@sunbird/core';
import { ToasterService, ResourceService, INoResultMessage } from '@sunbird/shared';
import { UUID } from 'angular2-uuid';
import { ActivatedRoute, Router } from '@angular/router';

@Component({
  selector: 'app-usage-reports',
  templateUrl: './usage-reports.component.html',
  styleUrls: ['./usage-reports.component.scss']
})
export class UsageReportsComponent implements OnInit {

  reportMetaData: any;
  chartData: Array<object> = [];
  table: any;
  isTableDataLoaded = false;
  currentReport: any;
  slug: string;
  noResult: boolean;
  noResultMessage: INoResultMessage;
  private activatedRoute: ActivatedRoute;
  telemetryImpression: IImpressionEventInput;
  telemetryInteractEdata: IInteractEventEdata;
  telemetryInteractDownloadEdata: IInteractEventEdata;
  @ViewChild(TelemetryInteractDirective) telemetryInteractDirective;
  constructor(private usageService: UsageService, private sanitizer: DomSanitizer,
    public userService: UserService, private toasterService: ToasterService,
    public resourceService: ResourceService, activatedRoute: ActivatedRoute, private router: Router
  ) {
    this.activatedRoute = activatedRoute;
  }

  ngOnInit() {
    const reportsLocation = (<HTMLInputElement>document.getElementById('reportsLocation')).value;
    this.slug = _.get(this.userService, 'userProfile.rootOrg.slug');
    this.usageService.getData(`/${reportsLocation}/${this.slug}/config.json`).subscribe(data => {
      if (_.get(data, 'responseCode') === 'OK') {
        this.noResult = false;
        this.reportMetaData = _.get(data, 'result');
        if (this.reportMetaData[0]) { this.renderReport(this.reportMetaData[0]); }
      }
    }, (err) => {
      console.log(err);
      this.noResultMessage = {
        'messageText': 'messages.stmsg.m0131'
      };
      this.noResult = true;
    });
    this.setTelemetryImpression();
  }

  setTelemetryInteractObject(val) {
    return {
      id: val,
      type: 'view',
      ver: '1.0'
    };
  }

  reportType(reportType) {
    this.telemetryInteractDirective.telemetryInteractObject = this.setTelemetryInteractObject(_.get(this.currentReport, 'id'));
    this.telemetryInteractDirective.telemetryInteractEdata = {
      id: `report_${reportType}`,
      type: 'click',
      pageid: this.activatedRoute.snapshot.data.telemetry.pageid
    };
    this.telemetryInteractDirective.onClick();
  }

  setTelemetryImpression() {
    this.telemetryInteractEdata = {
      id: 'report-view',
      type: 'click',
      pageid: this.activatedRoute.snapshot.data.telemetry.pageid
    };

    this.telemetryInteractDownloadEdata = {
      id: 'report-download',
      type: 'click',
      pageid: this.activatedRoute.snapshot.data.telemetry.pageid
    };

    this.telemetryImpression = {
      context: {
        env: this.activatedRoute.snapshot.data.telemetry.env
      },
      object: {
        id: this.userService.userid,
        type: 'user',
        ver: '1.0'
      },
      edata: {
        type: this.activatedRoute.snapshot.data.telemetry.type,
        pageid: this.activatedRoute.snapshot.data.telemetry.pageid,
        uri: this.router.url
      }
    };
  }

  renderReport(report: any) {
    this.currentReport = report;
    this.isTableDataLoaded = false;
    const url = report.dataSource;
    this.table = {};
    this.chartData = [];
    this.usageService.getData(url).subscribe((response) => {
      if (_.get(response, 'responseCode') === 'OK') {
        const data = _.get(response, 'result');
        if (_.get(report, 'charts')) { this.createChartData(_.get(report, 'charts'), data); }
        if (_.get(report, 'table')) { this.renderTable(_.get(report, 'table'), data); }
      } else {
        console.log(response);
      }
    }, err => { console.log(err); });
  }

  createChartData(charts, data) {
    _.forEach(charts, chart => {
      const chartObj: any = {};
      chartObj.options = _.get(chart, 'options') || { responsive: true };
      chartObj.colors = _.get(chart, 'colors') || ['#024F9D'];
      chartObj.chartType = _.get(chart, 'chartType') || 'line';
      chartObj.labels = _.get(chart, 'labels') || _.get(data, _.get(chart, 'labelsExpr'));
      chartObj.legend = (_.get(chart, 'legend') === false) ? false : true;
      chartObj.datasets = [];
      _.forEach(chart.datasets, dataset => {
        chartObj.datasets.push({
          label: dataset.label,
          data: _.get(dataset, 'data') || _.get(data, _.get(dataset, 'dataExpr'))
        });
      });
      this.chartData.push(chartObj);
    });

  }

  renderTable(table, data) {
    this.table.header = _.get(table, 'columns') || _.get(data, _.get(table, 'columnsExpr'));
    this.table.data = _.get(table, 'values') || _.get(data, _.get(table, 'valuesExpr'));
    this.isTableDataLoaded = true;
  }

  downloadCSV(url) {
    this.usageService.getData(url).subscribe((response) => {
      if (_.get(response, 'responseCode') === 'OK') {
        const data = _.get(response, 'result');
        const blob = new Blob(
          [data],
          {
            type: 'text/csv;charset=utf-8'
          }
        );
        const downloadUrl = URL.createObjectURL(blob);
        const a = document.createElement('a');
        document.body.appendChild(a);
        //        a.style = 'display: none';
        a.href = downloadUrl;
        a.download = UUID.UUID() + '.csv';
        a.click();
        document.body.removeChild(a);
      } else {
        this.toasterService.error(this.resourceService.messages.emsg.m0019);
      }
    }, (err) => {
      console.log(err);
      this.toasterService.error(this.resourceService.messages.emsg.m0019);
    });
  }

  transformHTML(data: any) {
    return this.sanitizer.bypassSecurityTrustHtml(data);
  }
}
